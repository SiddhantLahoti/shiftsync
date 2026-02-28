import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Briefcase } from 'lucide-react';

export default function Login() {
    const [isRegistering, setIsRegistering] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('employee');
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (isRegistering) {
                await axios.post('http://localhost:8000/register', { username, password, role });
                alert("Registration successful! Please log in.");
                setIsRegistering(false);
            } else {
                const res = await axios.post('http://localhost:8000/login', { username, password });
                localStorage.setItem('token', res.data.access_token);
                navigate('/dashboard');
            }
        } catch (err: any) {
            // NEW: Log the full error to the browser console for debugging
            console.error("Full Backend Error:", err.response?.data);

            // Handle Pydantic 422 array errors gracefully
            if (err.response?.status === 422) {
                alert("Validation Error: Check password length (min 6) and username length (min 3).");
            } else {
                alert(err.response?.data?.detail || "An error occurred. Check the console.");
            }
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md border border-slate-100">
                <div className="flex justify-center mb-6">
                    <div className="p-3 bg-blue-600 rounded-xl"><Briefcase className="w-8 h-8 text-white" /></div>
                </div>
                <h2 className="text-2xl font-bold text-center mb-6 text-slate-800">
                    {isRegistering ? 'Create an Account' : 'Welcome back'}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
                    <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
                    {isRegistering && (
                        <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none">
                            <option value="employee">Employee</option>
                            <option value="manager">Manager</option>
                        </select>
                    )}
                    <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors">
                        {isRegistering ? 'Register' : 'Login'}
                    </button>
                </form>
                <p className="text-center mt-4 text-sm text-slate-500 cursor-pointer hover:text-blue-600" onClick={() => setIsRegistering(!isRegistering)}>
                    {isRegistering ? 'Already have an account? Login' : "Don't have an account? Register"}
                </p>
            </div>
        </div>
    );
}