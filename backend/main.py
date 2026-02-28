import json
from fastapi import FastAPI, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from passlib.context import CryptContext
from models import ShiftSchema, UserCreate, Token, ShiftUpdate, ApprovalAction
from database import db, shift_collection
from bson import ObjectId
from auth import require_manager, get_current_user, create_access_token, verify_password, get_password_hash
from pydantic import BaseModel
from datetime import datetime

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

user_collection = db.get_collection("users")

# --- WEBSOCKET MANAGER (Upgraded to handle JSON) ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    async def broadcast_json(self, data: dict):
        for connection in self.active_connections:
            # FIX: default=str prevents crashes when sending datetime objects!
            await connection.send_text(json.dumps(data, default=str))

manager = ConnectionManager()





@app.put("/shifts/{shift_id}", response_model=ShiftSchema)
async def update_shift(shift_id: str, shift_data: ShiftUpdate, user: dict = Depends(require_manager)):
    updated_shift = await shift_collection.find_one_and_update(
        {"_id": ObjectId(shift_id)},
        {"$set": {
            "title": shift_data.title,
            "start_time": shift_data.start_time,
            "end_time": shift_data.end_time
        }},
        return_document=True
    )
    if updated_shift:
        updated_shift["_id"] = str(updated_shift["_id"])
        # Broadcast the updated shift so all screens change instantly
        await manager.broadcast_json({"action": "UPDATE_SHIFT", "shift": updated_shift})
        return updated_shift
    raise HTTPException(status_code=404, detail="Shift not found")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.active_connections.remove(websocket)

# --- REAL AUTHENTICATION ROUTES ---
@app.post("/register")
async def register_user(user: UserCreate):
    existing_user = await user_collection.find_one({"username": user.username})
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already taken")
    
    hashed_password = get_password_hash(user.password)
    new_user = {"username": user.username, "password": hashed_password, "role": user.role}
    await user_collection.insert_one(new_user)
    return {"message": "User registered successfully"}

@app.post("/login", response_model=Token)
async def login(user: dict):
    # Expecting {"username": "...", "password": "..."} from React
    db_user = await user_collection.find_one({"username": user.get("username")})
    if not db_user or not verify_password(user.get("password"), db_user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_access_token(data={"username": db_user["username"], "role": db_user["role"]})
    return {"access_token": token, "token_type": "bearer"}

# --- SHIFT ROUTES (With WebSocket JSON Fix) ---
@app.post("/shifts/", response_model=ShiftSchema)
async def create_shift(shift: ShiftSchema, user: dict = Depends(require_manager)):
    shift_dict = shift.model_dump(by_alias=True, exclude=["id"])
    new_shift = await shift_collection.insert_one(shift_dict)
    
    created_shift = await shift_collection.find_one({"_id": new_shift.inserted_id})
    created_shift["_id"] = str(created_shift["_id"])
    
    # Broadcast the new shift object directly
    await manager.broadcast_json({"action": "NEW_SHIFT", "shift": created_shift})
    return created_shift

@app.get("/shifts/", response_model=list[ShiftSchema])
async def get_shifts():
    shifts = await shift_collection.find().to_list(100)
    for shift in shifts:
        shift["_id"] = str(shift["_id"])
    return shifts

# --- 1. THE REQUEST SHIFT ROUTE (With Overlap Prevention) ---
@app.put("/shifts/{shift_id}/request", response_model=ShiftSchema)
async def request_shift(shift_id: str, bg_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    # Fetch the target shift to get its start and end times
    target_shift = await shift_collection.find_one({"_id": ObjectId(shift_id)})
    if not target_shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    # ALGORITHM: Time Overlap Prevention
    # Check if the user is already assigned to ANY shift that overlaps with this new one
    overlapping_shift = await shift_collection.find_one({
        "assigned_employees": user["username"],
        "$and": [
            {"start_time": {"$lt": target_shift["end_time"]}},
            {"end_time": {"$gt": target_shift["start_time"]}}
        ]
    })
    
    if overlapping_shift:
        raise HTTPException(status_code=400, detail="Schedule conflict! You are already working during this time.")

    # Move user to the pending queue
    updated_shift = await shift_collection.find_one_and_update(
        {"_id": ObjectId(shift_id)},
        {"$addToSet": {"pending_employees": user["username"]}},
        return_document=True
    )
    
    updated_shift["_id"] = str(updated_shift["_id"])
    
    # Trigger Background Audit Log & WebSocket Update
    bg_tasks.add_task(log_audit_action, "Requested Shift", user["username"], shift_id)
    await manager.broadcast_json({"action": "UPDATE_SHIFT", "shift": updated_shift})
    return updated_shift


# --- 2. MANAGER APPROVAL ROUTE ---
@app.put("/shifts/{shift_id}/review", response_model=ShiftSchema)
async def review_shift_request(shift_id: str, payload: ApprovalAction, bg_tasks: BackgroundTasks, user: dict = Depends(require_manager)):
    # Remove from pending queue
    update_query = {"$pull": {"pending_employees": payload.employee_name}}
    
    # If approved, also add to assigned array
    if payload.action == "approve":
        update_query["$addToSet"] = {"assigned_employees": payload.employee_name} # type: ignore

    updated_shift = await shift_collection.find_one_and_update(
        {"_id": ObjectId(shift_id)},
        update_query,
        return_document=True
    )
    
    if not updated_shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    updated_shift["_id"] = str(updated_shift["_id"])
    
    log_msg = f"{'Approved' if payload.action == 'approve' else 'Denied'} {payload.employee_name}"
    bg_tasks.add_task(log_audit_action, log_msg, user["username"], shift_id)
    await manager.broadcast_json({"action": "UPDATE_SHIFT", "shift": updated_shift})
    
    return updated_shift


# --- 3. THE DROP SHIFT ROUTE ---

@app.put("/shifts/{shift_id}/drop", response_model=ShiftSchema)
async def drop_shift(shift_id: str, bg_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    updated_shift = await shift_collection.find_one_and_update(
        {"_id": ObjectId(shift_id)},
        {"$pull": {
            "assigned_employees": user["username"],
            "pending_employees": user["username"],
            "drop_requests": user["username"]
        }},
        return_document=True
    )
    
    if updated_shift:
        updated_shift["_id"] = str(updated_shift["_id"])
        bg_tasks.add_task(log_audit_action, "Cancelled Request/Dropped", user["username"], shift_id)
        await manager.broadcast_json({"action": "UPDATE_SHIFT", "shift": updated_shift})
        return updated_shift
        
    raise HTTPException(status_code=404, detail="Shift not found")
@app.put("/shifts/{shift_id}/request-drop", response_model=ShiftSchema)
async def request_drop(shift_id: str, bg_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    # Add user to the drop_requests queue
    updated_shift = await shift_collection.find_one_and_update(
        {"_id": ObjectId(shift_id)},
        {"$addToSet": {"drop_requests": user["username"]}},
        return_document=True
    )
    if updated_shift:
        updated_shift["_id"] = str(updated_shift["_id"])
        bg_tasks.add_task(log_audit_action, "Requested to Drop Shift", user["username"], shift_id)
        await manager.broadcast_json({"action": "UPDATE_SHIFT", "shift": updated_shift})
        return updated_shift
    raise HTTPException(status_code=404, detail="Shift not found")


@app.put("/shifts/{shift_id}/review-drop", response_model=ShiftSchema)
async def review_drop_request(shift_id: str, payload: ApprovalAction, bg_tasks: BackgroundTasks, user: dict = Depends(require_manager)):
    # Always remove from the drop queue
    update_query = {"$pull": {"drop_requests": payload.employee_name}}
    
    # If approved, ALSO remove them from the assigned_employees list
    if payload.action == "approve":
        update_query["$pull"]["assigned_employees"] = payload.employee_name # type: ignore

    updated_shift = await shift_collection.find_one_and_update(
        {"_id": ObjectId(shift_id)},
        update_query,
        return_document=True
    )
    
    updated_shift["_id"] = str(updated_shift["_id"])
    log_msg = f"{'Approved' if payload.action == 'approve' else 'Denied'} Drop Request for {payload.employee_name}"
    bg_tasks.add_task(log_audit_action, log_msg, user["username"], shift_id)
    await manager.broadcast_json({"action": "UPDATE_SHIFT", "shift": updated_shift})
    return updated_shift

@app.delete("/shifts/{shift_id}")
async def delete_shift(shift_id: str, bg_tasks: BackgroundTasks, user: dict = Depends(require_manager)):
    result = await shift_collection.delete_one({"_id": ObjectId(shift_id)})
    if result.deleted_count == 1:
        bg_tasks.add_task(log_audit_action, "Deleted Shift", user["username"], shift_id)
        # Tell all React clients to remove this specific ID from their state
        await manager.broadcast_json({"action": "DELETE_SHIFT", "shift_id": shift_id})
        return {"message": "Shift deleted successfully"}
    raise HTTPException(status_code=404, detail="Shift not found")

@app.get("/analytics")
async def get_analytics(user: dict = Depends(require_manager)):
    pipeline = [
        # 1. Deconstruct the array so we can count per employee
        {"$unwind": "$assigned_employees"},
        
        # 2. Calculate the difference between end and start time in milliseconds, then convert to hours
        {"$addFields": {
            "duration_hours": {
                "$divide": [
                    {"$subtract": ["$end_time", "$start_time"]},
                    3600000 
                ]
            }
        }},
        
        # 3. Group by employee, sum their shifts, AND sum their calculated hours
        {"$group": {
            "_id": "$assigned_employees", 
            "total_shifts_claimed": {"$sum": 1},
            "total_hours": {"$sum": "$duration_hours"}
        }},
        
        # 4. Sort by who is working the most hours
        {"$sort": {"total_hours": -1}}
    ]
    
    return await shift_collection.aggregate(pipeline).to_list(100)

audit_collection = db.get_collection("audit_logs")

# The asynchronous background task
async def log_audit_action(action: str, username: str, shift_id: str):
    log_entry = {
        "action": action,
        "user": username,
        "target_shift_id": str(shift_id),
        "timestamp": datetime.utcnow()
    }
    await audit_collection.insert_one(log_entry)