# ShiftSync: Real-Time Workforce Coordination Platform

ShiftSync is a high-performance, full-stack scheduling ecosystem engineered to streamline labor management through real-time data synchronization and automated business logic. Built with **FastAPI** and **React**, the platform eliminates coordination overhead by providing an instantaneous, single source of truth for shift assignments, staff analytics, and operational audit trails.

---

## 🛠️ Technical Architecture

### **Backend (High-Concurrency & Asynchronous)**
* **Framework**: **FastAPI** (Python) utilizing asynchronous request handling for superior performance.
* **Database**: **MongoDB** with the **Motor** driver for non-blocking database operations and flexible document modeling.
* **Real-Time Engine**: Custom **WebSocket Manager** designed to broadcast state changes (new shifts, updates, deletions) to all active clients instantly.
* **Security**: **JWT-based Authentication** with **Passlib** encryption and **Role-Based Access Control (RBAC)** to enforce strict data boundaries between managers and staff.

### **Frontend (Reactive & Type-Safe)**
* **Framework**: **React 19** powered by **Vite** and **TypeScript** for a robust, type-safe development environment.
* **Styling**: **Tailwind CSS 4** for a high-performance, utility-first responsive interface.
* **Visualizations**: **Recharts** integration for rendering complex staff productivity metrics and labor hour distributions.
* **State Management**: Real-time synchronization logic that updates the local UI state automatically upon receiving WebSocket payloads.

---

## 🌟 Strategic Features & Implementation

### **1. Intelligent Conflict Resolution (Overlap Prevention)**
To ensure operational integrity, the system features a custom **Time Overlap Prevention algorithm**. Before allowing an employee to claim a shift, the backend cross-references the requested time block against the user's existing assignments using MongoDB query logic, effectively eliminating scheduling conflicts at the database level.

### **2. Staff Analytics Pipeline**
Built a sophisticated **Data Aggregation Pipeline** that transforms raw scheduling records into actionable business intelligence. It calculates total shifts claimed and cumulative labor hours per employee in real-time, providing managers with instant visibility into workforce distribution.

### **3. Asynchronous Audit Logging**
Implemented a non-blocking **Audit Logging system** using FastAPI **Background Tasks**. Critical actions—such as shift deletions, approvals, or drop requests—are logged to a dedicated audit collection without increasing API response latency, ensuring a permanent and performant trail of administrative changes.

---

## 📂 Project Directory Structure

```text
shiftsync/
├── backend/
│   ├── main.py         # FastAPI Entry point & WebSocket logic
│   ├── auth.py         # JWT & RBAC security implementation
│   ├── models.py       # Pydantic schemas for data validation
│   └── database.py     # MongoDB connection & collection handlers
└── frontend/
    ├── src/
    │   ├── pages/      # Dashboard, Analytics, and Login views
    │   ├── types.ts    # Centralized TypeScript definitions
    │   └── App.tsx     # Routing & Provider configuration
```

---

## 🚀 Deployment & Configuration

### **Backend Setup**
1.  **Install Dependencies**: 
    ```bash
    cd backend && pip install -r requirements.txt
    ```
2.  **Environment Configuration**: Create a `.env` file with your `MONGO_URI` and `SECRET_KEY`.
3.  **Launch Server**: 
    ```bash
    uvicorn main:app --reload
    ```

### **Frontend Setup**
1.  **Install Dependencies**: 
    ```bash
    cd frontend && npm install
    ```
2.  **Launch Development Environment**: 
    ```bash
    npm run dev
    ```

---

## 📈 Key API Specifications

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| **WS** | `/ws` | Public | Real-time WebSocket connection for live updates. |
| **GET** | `/analytics` | Manager | Aggregated staff performance and hour metrics. |
| **PUT** | `/shifts/{id}/request`| Employee| Claim an open shift with conflict validation. |
| **PUT** | `/shifts/{id}/review` | Manager | Approve or deny pending staff claim requests. |
| **DELETE**| `/shifts/{id}` | Manager | Permanently remove shift and notify all clients. |
