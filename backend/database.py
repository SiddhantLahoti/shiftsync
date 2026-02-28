import motor.motor_asyncio

# This URL connects directly to your local MongoDB Compass
MONGO_URL = "mongodb://localhost:27017"
client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URL)

# Create a database called 'shiftsync' and a collection called 'shifts'
db = client.shiftsync
shift_collection = db.get_collection("shifts")