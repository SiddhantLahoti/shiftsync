import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ArrowLeft } from 'lucide-react';

export default function Analytics() {
    const [data, setData] = useState([]);
    const navigate = useNavigate();
    const token = localStorage.getItem('token');

    useEffect(() => {
        if (!token) return navigate('/login');

        axios.get('http://localhost:8000/analytics', {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => {
                const formattedData = res.data.map((item: any) => ({
                    name: item._id,
                    shifts: item.total_shifts_claimed,
                    hours: Math.round(item.total_hours * 10) / 10 // Round to 1 decimal place
                }));
                setData(formattedData);
            })
            .catch(() => {
                alert("Unauthorized access");
                navigate('/dashboard');
            });
    }, [token, navigate]);

    return (
        <div className="min-h-screen bg-slate-50 p-6 md:p-10 font-sans">
            <div className="max-w-5xl mx-auto">
                <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-8 font-medium">
                    <ArrowLeft className="w-5 h-5" /> Back to Calendar
                </button>

                <h1 className="text-3xl font-bold text-slate-800 mb-2">Staff Analytics Pipeline</h1>
                <p className="text-slate-500 mb-8">Real-time data aggregated directly from MongoDB.</p>

                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 h-96">
                    <ResponsiveContainer width="100%" height="100%">
                        <RechartsBarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                            <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                            <Bar dataKey="shifts" name="Total Shifts" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
                            <Bar dataKey="hours" name="Total Hours" fill="#a855f7" radius={[4, 4, 0, 0]} barSize={40} />
                        </RechartsBarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}