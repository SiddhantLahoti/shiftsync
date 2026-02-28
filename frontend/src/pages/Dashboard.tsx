import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import { format } from 'date-fns';
import { Calendar, Clock, Users, Plus, BarChart, LogOut, Edit2, X, Trash2 } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import type { Shift } from '../types';

export default function Dashboard() {
    const [shifts, setShifts] = useState<Shift[]>([]);

    // Form State
    const [title, setTitle] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);

    const navigate = useNavigate();
    const token = localStorage.getItem('token');
    const role = token ? jwtDecode<{ role: string }>(token).role : null;
    const username = token ? jwtDecode<{ username: string }>(token).username : null;

    useEffect(() => {
        if (!token) {
            navigate('/login');
            return;
        }

        // Initial data fetch
        axios.get('http://localhost:8000/shifts/').then(res => setShifts(res.data));

        // Robust WebSocket Connection
        const ws = new WebSocket('ws://localhost:8000/ws');

        ws.onopen = () => {
            console.log("🟢 WebSocket Connected Successfully!");
        };

        ws.onmessage = (event) => {
            const payload = JSON.parse(event.data);
            if (payload.action === "NEW_SHIFT") {
                setShifts(prev => [...prev, payload.shift]);
                if (role !== 'manager') toast('New shift published!', { icon: '📢' });
            } else if (payload.action === "UPDATE_SHIFT") {
                setShifts(prev => prev.map(s => s._id === payload.shift._id ? payload.shift : s));
            } else if (payload.action === "DELETE_SHIFT") {
                // Instantly filter out the deleted shift
                setShifts(prev => prev.filter(s => s._id !== payload.shift_id));
                toast.error("A shift was removed by a manager");
            }
        };

        ws.onclose = () => {
            console.log("🔴 WebSocket Disconnected.");
        };

        return () => {
            ws.close();
        };
    }, [token, navigate, role]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const loadingToast = toast.loading(editingId ? "Saving changes..." : "Publishing shift...");

        try {
            const payload = { title, start_time: startTime, end_time: endTime };

            if (editingId) {
                await axios.put(`http://localhost:8000/shifts/${editingId}`, payload, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                toast.success("Shift updated successfully!", { id: loadingToast });
                setEditingId(null);
            } else {
                await axios.post('http://localhost:8000/shifts/', { ...payload, assigned_employees: [] }, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                toast.success("Shift published!", { id: loadingToast });
            }
            // Reset form
            setTitle(''); setStartTime(''); setEndTime('');
        } catch (err) {
            toast.error("Failed to save shift", { id: loadingToast });
        }
    };

    const handleEditClick = (shift: Shift) => {
        const formatForInput = (dateString: string) => new Date(dateString).toISOString().slice(0, 16);
        setTitle(shift.title);
        setStartTime(formatForInput(shift.start_time));
        setEndTime(formatForInput(shift.end_time));
        setEditingId(shift._id || null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("Permanently delete this shift? This will remove all assigned employees.")) return;
        try {
            await axios.delete(`http://localhost:8000/shifts/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        } catch (err) {
            toast.error("Failed to delete shift");
        }
    };

    // Employee requests to take an open shift
    const handleRequest = async (id: string) => {
        const tId = toast.loading("Requesting shift...");
        try {
            await axios.put(`http://localhost:8000/shifts/${id}/request`, {}, { headers: { Authorization: `Bearer ${token}` } });
            toast.success("Shift requested! Awaiting approval.", { id: tId });
        } catch (err: any) {
            toast.error(err.response?.data?.detail || "Failed to request shift", { id: tId });
        }
    };

    // Employee cancels their pending claim request
    const handleDrop = async (id: string) => {
        if (!window.confirm("Cancel this request?")) return;
        try {
            await axios.put(`http://localhost:8000/shifts/${id}/drop`, {}, { headers: { Authorization: `Bearer ${token}` } });
            toast.success("Request cancelled");
        } catch (err) { toast.error("Error cancelling request"); }
    };

    // Employee requests to drop a shift they are already assigned to
    const requestDrop = async (id: string) => {
        if (!window.confirm("Request to drop this shift? A manager must approve this.")) return;
        const tId = toast.loading("Sending drop request...");
        try {
            await axios.put(`http://localhost:8000/shifts/${id}/request-drop`, {}, { headers: { Authorization: `Bearer ${token}` } });
            toast.success("Drop request sent! Awaiting manager approval.", { id: tId });
        } catch (err: any) {
            toast.error(err.response?.data?.detail || "Failed to request drop", { id: tId });
        }
    };

    // Manager reviews a claim request
    const handleReview = async (shiftId: string, employeeName: string, action: 'approve' | 'deny') => {
        try {
            await axios.put(`http://localhost:8000/shifts/${shiftId}/review`, {
                employee_name: employeeName, action
            }, { headers: { Authorization: `Bearer ${token}` } });
            toast.success(`Claim request ${action}d`);
        } catch (err) { toast.error("Error processing review"); }
    };

    // Manager reviews a drop request
    const handleReviewDrop = async (shiftId: string, employeeName: string, action: 'approve' | 'deny') => {
        try {
            await axios.put(`http://localhost:8000/shifts/${shiftId}/review-drop`, {
                employee_name: employeeName, action
            }, { headers: { Authorization: `Bearer ${token}` } });
            toast.success(`Drop request ${action}d`);
        } catch (err) { toast.error("Error processing drop review"); }
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        toast.success("Logged out successfully");
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-slate-50 p-6 md:p-10 font-sans">
            <Toaster position="top-right" reverseOrder={false} />

            <header className="max-w-6xl mx-auto flex justify-between items-center mb-10">
                <h1 className="text-3xl font-bold text-slate-800">ShiftSync Calendar</h1>
                <div className="flex gap-4 items-center">
                    <span className="font-semibold text-slate-600">Hi, {username} ({role})</span>
                    {role === 'manager' && (
                        <button onClick={() => navigate('/analytics')} className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 font-medium">
                            <BarChart className="w-4 h-4" /> Analytics
                        </button>
                    )}
                    <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-red-100 font-medium transition-colors">
                        <LogOut className="w-4 h-4" /> Logout
                    </button>
                </div>
            </header>

            <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
                {role === 'manager' && (
                    <section className="lg:col-span-1">
                        <div className={`p-6 rounded-2xl shadow-sm border ${editingId ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'}`}>
                            <div className="flex justify-between items-center mb-6">
                                <h2 className={`text-lg font-semibold flex items-center gap-2 ${editingId ? 'text-amber-700' : 'text-slate-800'}`}>
                                    {editingId ? <Edit2 className="w-5 h-5" /> : <Plus className="w-5 h-5 text-blue-600" />}
                                    {editingId ? 'Edit Shift' : 'Publish Shift'}
                                </h2>
                                {editingId && (
                                    <button onClick={() => { setEditingId(null); setTitle(''); setStartTime(''); setEndTime(''); }} className="text-slate-400 hover:text-slate-700">
                                        <X className="w-5 h-5" />
                                    </button>
                                )}
                            </div>

                            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase">Shift Title</label>
                                    <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required className="mt-1 w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase">Start Time</label>
                                    <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} required className="mt-1 w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase">End Time</label>
                                    <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} required className="mt-1 w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none" />
                                </div>
                                <button type="submit" className={`w-full text-white font-medium py-2.5 rounded-xl shadow-md transition-all ${editingId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'}`}>
                                    {editingId ? 'Save Changes' : 'Create'}
                                </button>
                            </form>
                        </div>
                    </section>
                )}

                <section className={`lg:col-span-${role === 'manager' ? '2' : '3'}`}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {shifts.map((shift) => {
                            const isAssignedToMe = shift.assigned_employees?.includes(username || '');
                            const isPendingForMe = shift.pending_employees?.includes(username || '');
                            const isDropRequested = shift.drop_requests?.includes(username || '');

                            return (
                                <div key={shift._id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
                                    <div className={`absolute top-0 left-0 w-1 h-full ${isAssignedToMe ? 'bg-green-500' : isPendingForMe ? 'bg-amber-400' : 'bg-blue-500'}`}></div>

                                    <div className="flex justify-between items-start mb-4">
                                        <h3 className="text-lg font-bold text-slate-800">{shift.title}</h3>
                                        {role === 'manager' && (
                                            <div className="flex gap-3">
                                                <button onClick={() => handleEditClick(shift)} className="text-slate-300 hover:text-blue-500"><Edit2 className="w-4 h-4" /></button>
                                                <button onClick={() => handleDelete(shift._id!)} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-3 mb-6 text-sm text-slate-600">
                                        <div className="flex gap-3"><Calendar className="w-4 h-4 text-slate-400" /> {format(new Date(shift.start_time), 'MMM do, yyyy')}</div>
                                        <div className="flex gap-3"><Clock className="w-4 h-4 text-slate-400" /> {format(new Date(shift.start_time), 'h:mm a')} - {format(new Date(shift.end_time), 'h:mm a')}</div>

                                        {/* Active Roster */}
                                        <div className="flex gap-3"><Users className="w-4 h-4 text-slate-400 mt-0.5" />
                                            <div className="flex flex-wrap gap-2">
                                                {shift.assigned_employees?.map((emp, i) => <span key={`active-${i}`} className="bg-green-50 text-green-700 px-2 py-0.5 rounded-md text-xs font-semibold">{emp}</span>)}
                                                {(!shift.assigned_employees || shift.assigned_employees.length === 0) && <span className="text-slate-400 italic text-xs">Unassigned</span>}
                                            </div>
                                        </div>
                                    </div>

                                    <hr className="my-4 border-slate-100" />

                                    {/* Manager View: Claim Requests Queue */}
                                    {role === 'manager' && shift.pending_employees && shift.pending_employees.length > 0 && (
                                        <div className="mb-4 p-3 bg-amber-50 rounded-xl border border-amber-100">
                                            <p className="text-xs font-bold text-amber-800 uppercase mb-2">Pending Claim Approvals</p>
                                            {shift.pending_employees.map(emp => (
                                                <div key={emp} className="flex justify-between items-center bg-white p-2 rounded-lg mb-2 shadow-sm border border-amber-100 text-sm">
                                                    <span className="font-medium text-slate-700">{emp}</span>
                                                    <div className="flex gap-2">
                                                        <button onClick={() => handleReview(shift._id!, emp, 'approve')} className="px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 font-medium text-xs">Approve</button>
                                                        <button onClick={() => handleReview(shift._id!, emp, 'deny')} className="px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 font-medium text-xs">Deny</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Manager View: Drop Requests Queue */}
                                    {role === 'manager' && shift.drop_requests && shift.drop_requests.length > 0 && (
                                        <div className="mb-4 p-3 bg-red-50 rounded-xl border border-red-100">
                                            <p className="text-xs font-bold text-red-800 uppercase mb-2">Pending Drop Requests</p>
                                            {shift.drop_requests.map(emp => (
                                                <div key={`drop-${emp}`} className="flex justify-between items-center bg-white p-2 rounded-lg mb-2 shadow-sm border border-red-100 text-sm">
                                                    <span className="font-medium text-slate-700">{emp}</span>
                                                    <div className="flex gap-2">
                                                        <button onClick={() => handleReviewDrop(shift._id!, emp, 'approve')} className="px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 font-medium text-xs">Approve Drop</button>
                                                        <button onClick={() => handleReviewDrop(shift._id!, emp, 'deny')} className="px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 font-medium text-xs">Deny</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Employee View: Contextual Buttons */}
                                    {role === 'employee' && (
                                        (() => {
                                            if (isDropRequested) {
                                                return <button disabled className="w-full bg-slate-100 text-slate-400 font-semibold py-2 rounded-lg cursor-not-allowed border border-slate-200">Drop Pending Approval</button>;
                                            }
                                            if (isAssignedToMe) {
                                                return <button onClick={() => requestDrop(shift._id!)} className="w-full bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 font-semibold py-2 rounded-lg transition-colors">Request to Drop</button>;
                                            }
                                            if (isPendingForMe) {
                                                return <button onClick={() => handleDrop(shift._id!)} className="w-full bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200 font-semibold py-2 rounded-lg transition-colors">Cancel Claim Request</button>;
                                            }
                                            return <button onClick={() => handleRequest(shift._id!)} className="w-full bg-slate-900 text-white font-semibold py-2 rounded-lg hover:bg-slate-800 transition-colors">Request Shift</button>;
                                        })()
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>
            </main>
        </div>
    );
}