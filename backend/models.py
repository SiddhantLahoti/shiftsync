from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime

# --- USER AUTHENTICATION SCHEMAS ---
class UserCreate(BaseModel):
    username: str = Field(..., min_length=3)
    password: str = Field(..., min_length=6)
    role: str = Field(..., pattern="^(manager|employee)$")

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

# --- SHIFT MANAGEMENT SCHEMAS ---
class ShiftSchema(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    title: str = Field(..., min_length=3, max_length=50)
    start_time: datetime
    end_time: datetime
    assigned_employees: List[str] = []
    pending_employees: List[str] = [] 
    drop_requests: List[str] = []

    model_config = ConfigDict(
        populate_by_name=True,
        json_schema_extra={
            "example": {
                "title": "Morning Barista",
                "start_time": "2026-02-21T08:00:00",
                "end_time": "2026-02-21T12:00:00",
            }
        }
    )

class ShiftUpdate(BaseModel):
    title: str
    start_time: datetime
    end_time: datetime

class ApprovalAction(BaseModel):
    employee_name: str
    action: str 

# --- AUDIT LOG SCHEMAS ---
class AuditLogSchema(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    action: str
    user: str
    target_shift_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)