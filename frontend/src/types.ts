// This strictly matches the ShiftSchema in your Python backend
export interface Shift {
    _id?: string;
    title: string;
    start_time: string;
    end_time: string;
    assigned_employees: string[];
    drop_requests?: string[];
}