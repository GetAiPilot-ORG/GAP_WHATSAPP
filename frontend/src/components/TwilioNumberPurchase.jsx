import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Search, ShoppingCart, Loader2, Phone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API_BASE = `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api`;

export default function TwilioNumberPurchase() {
    const { apiCall } = useAuth();
    const navigate = useNavigate();
    const [country, setCountry] = useState('US');
    const [numbers, setNumbers] = useState([]);
    const [searching, setSearching] = useState(false);
    const [buying, setBuying] = useState(false);
    const [error, setError] = useState('');

    const searchNumbers = async () => {
        setSearching(true);
        setError('');
        try {
            const res = await apiCall(`${API_BASE}/twilio/available-numbers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ country })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to search numbers');
            setNumbers(data.numbers || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setSearching(false);
        }
    };

    const buyNumber = async (phoneNumber) => {
        setBuying(phoneNumber);
        setError('');
        try {
            const res = await apiCall(`${API_BASE}/twilio/buy-number`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneNumber })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to buy number');
            
            // Redirect to connect page with the new number
            navigate('/whatsapp-connect');
        } catch (err) {
            setError(err.message);
        } finally {
            setBuying(false);
        }
    };

    return (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-3 mb-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
                    <Phone className="h-6 w-6" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-gray-950">Buy Virtual Number</h2>
                    <p className="text-sm text-gray-500">Instant dedicated number from Twilio for Meta verification.</p>
                </div>
            </div>

            {error && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    {error}
                </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <div className="flex flex-1 rounded-xl border border-gray-300 bg-white shadow-sm focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 overflow-hidden">
                    <select 
                        value={country} 
                        onChange={e => setCountry(e.target.value)}
                        className="w-full bg-transparent px-4 py-3 text-sm font-medium text-gray-900 outline-none sm:w-auto sm:border-r sm:border-gray-200"
                    >
                        <option value="US">🇺🇸 United States (+1)</option>
                        <option value="GB">🇬🇧 United Kingdom (+44)</option>
                        <option value="CA">🇨🇦 Canada (+1)</option>
                    </select>
                    <div className="hidden sm:flex flex-1 items-center px-3 text-sm text-gray-500">
                        Search for a new dedicated number
                    </div>
                </div>
                <button
                    onClick={searchNumbers}
                    disabled={searching}
                    className="inline-flex h-11 w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
                >
                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Search Numbers
                </button>
            </div>

            {numbers.length > 0 ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <h3 className="text-sm font-bold text-gray-950 uppercase tracking-wide">Available Numbers</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {numbers.map((num, i) => (
                            <div key={i} className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-gray-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md">
                                <div className="mb-4">
                                    <span className="font-mono text-lg font-bold tracking-tight text-gray-900">{num.friendlyName}</span>
                                    <span className="mt-1 block text-xs text-gray-500">Voice, SMS, MMS capable</span>
                                </div>
                                <button
                                    onClick={() => buyNumber(num.phoneNumber)}
                                    disabled={buying !== false}
                                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 transition-all group-hover:bg-indigo-50 group-hover:text-indigo-700 group-hover:ring-indigo-200 disabled:opacity-50"
                                >
                                    {buying === num.phoneNumber ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                                    Buy Now
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                !searching && !error && (
                    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/50 py-12 text-center">
                        <Phone className="mx-auto h-8 w-8 text-gray-400" strokeWidth={1.5} />
                        <h3 className="mt-3 text-sm font-medium text-gray-900">No numbers searched yet</h3>
                        <p className="mt-1 text-sm text-gray-500">Select a country and hit search to find an available virtual number.</p>
                    </div>
                )
            )}
        </div>
    );
}
