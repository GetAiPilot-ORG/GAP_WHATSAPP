import { useState, useRef, useEffect } from 'react';
import { X, Send, User, Bot, RefreshCw, List } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

export default function FlowTester({ flow, isOpen, onClose }) {
    const { session } = useAuth();
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [loading, setLoading] = useState(false);
    const [testState, setTestState] = useState({ currentNodeId: null, flowState: {} });
    const messagesEndRef = useRef(null);

    // Auto-scroll to bottom
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };
    useEffect(() => {
        scrollToBottom();
    }, [messages, loading]);

    useEffect(() => {
        if (isOpen && messages.length === 0) {
            setMessages([
                { id: '1', text: 'Hi! Type a keyword to start testing this flow.', sender: 'bot', time: new Date() }
            ]);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSend = async (e, forcedText = null) => {
        e?.preventDefault();
        const textToSend = typeof forcedText === 'string' ? forcedText : inputValue;
        if (!textToSend.trim() || loading) return;

        const userMsg = textToSend.trim();
        const newMessages = [...messages, { id: Date.now().toString(), text: userMsg, sender: 'user', time: new Date() }];
        setMessages(newMessages);
        setInputValue('');
        setLoading(true);

        try {
            const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
            const { data } = await axios.post(`${API_URL}/api/flows/${flow.id}/test`, {
                text: userMsg,
                currentNodeId: testState.currentNodeId,
                flowState: testState.flowState
            }, {
                headers: { Authorization: `Bearer ${session?.access_token}` }
            });

            if (data?.output) {
                setMessages(prev => [...prev, {
                    id: Date.now().toString() + 'bot',
                    text: data.output,
                    interactiveOptions: data.interactiveOptions || [],
                    buttons: data.buttons || [],
                    sender: 'bot',
                    time: new Date()
                }]);
            }
            if (data?.media && data.media.length > 0) {
                data.media.forEach((m, idx) => {
                    setMessages(prev => [...prev, {
                        id: Date.now().toString() + 'media' + idx,
                        text: m.caption || `[Media: ${m.type}]`,
                        mediaUrl: m.url,
                        mediaType: m.type,
                        sender: 'bot',
                        time: new Date()
                    }]);
                });
            }
            
            if (!data?.output && (!data?.media || data.media.length === 0)) {
                setMessages(prev => [...prev, {
                    id: Date.now().toString() + 'bot',
                    text: '⚠️ Flow did not return any message. Check if your conditions or keywords match.',
                    sender: 'bot',
                    isError: true,
                    time: new Date()
                }]);
            }

            setTestState({
                currentNodeId: data.currentNodeId,
                flowState: data.flowState || {}
            });

        } catch (error) {
            console.error('Error testing flow:', error);
            setMessages(prev => [...prev, {
                id: Date.now().toString() + 'err',
                text: '❌ Error executing flow test. See console.',
                sender: 'bot',
                isError: true,
                time: new Date()
            }]);
        } finally {
            setLoading(false);
        }
    };

    const handleReset = () => {
        setMessages([{ id: '1', text: 'Hi! Type a keyword to start testing this flow.', sender: 'bot', time: new Date() }]);
        setTestState({ currentNodeId: null, flowState: {} });
    };

    return (
        <div className="fixed inset-0 md:inset-auto md:right-6 md:bottom-6 z-[99999] md:z-[9999] 
            w-full h-full md:w-[340px] md:h-[600px] bg-white md:rounded-[2.5rem] md:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] 
            flex flex-col md:border-[6px] md:border-[#e5e7eb] md:ring-1 md:ring-gray-300/50 
            animate-slide-up md:animate-in md:slide-in-from-bottom-16 md:fade-in md:zoom-in-75 md:duration-500 md:ease-out">
            
            {/* Dynamic Island / Notch (Hidden on Mobile) */}
            <div className="hidden md:flex absolute top-2 left-1/2 -translate-x-1/2 w-24 h-5 bg-black rounded-full z-30 items-center justify-center gap-2 shadow-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-blue-950/80 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]"></div>
            </div>
            
            {/* Screen */}
            <div className="flex-1 bg-[#E4DCD4] md:rounded-[2rem] rounded-none overflow-hidden flex flex-col relative">
                    
                    {/* WhatsApp Header */}
                    <div className="bg-[#008069] text-white px-3 py-2.5 pt-7 flex items-center justify-between shadow-sm z-20">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                                <Bot className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-sm leading-tight truncate w-32">{flow.name}</h3>
                                <p className="text-[10px] text-white/80">Test Simulator</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button onClick={handleReset} className="p-1.5 hover:bg-white/10 rounded-full transition-colors" title="Reset Chat">
                                <RefreshCw className="h-4 w-4" />
                            </button>
                            <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full transition-colors">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    {/* Chat Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-cover bg-center" style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', opacity: 0.95 }}>
                        {messages.map((msg) => (
                            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 fade-in duration-200`}>
                                <div className={`min-w-[75px] max-w-[85%] rounded-2xl px-3.5 py-2 shadow-sm text-[14px] relative ${msg.sender === 'user' ? 'bg-[#dcf8c6] rounded-tr-sm' : msg.isError ? 'bg-red-50 text-red-800 border border-red-200 rounded-tl-sm' : 'bg-white rounded-tl-sm'}`}>
                                    {msg.mediaUrl && (
                                        <div className="mb-2 rounded overflow-hidden">
                                            {msg.mediaType === 'image' ? <img src={msg.mediaUrl} alt="media" className="w-full h-auto" /> : 
                                             msg.mediaType === 'video' ? <video src={msg.mediaUrl} controls className="w-full" /> :
                                             <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">View {msg.mediaType}</a>}
                                        </div>
                                    )}
                                    <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                                    
                                    {/* Render Buttons */}
                                    {msg.buttons && msg.buttons.length > 0 && (
                                        <div className="mt-3 flex flex-col gap-2">
                                            {msg.buttons.map((btn, i) => (
                                                <button 
                                                    key={i} 
                                                    onClick={() => handleSend(null, btn)}
                                                    className="w-full py-2 px-3 bg-[#e7f3fa] text-[#008069] font-medium rounded-lg border border-[#c4e1f3] shadow-sm hover:bg-[#d4e9f7] transition-colors text-sm text-center"
                                                >
                                                    {btn}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {/* Render Interactive Options (List Items) */}
                                    {msg.interactiveOptions && msg.interactiveOptions.length > 0 && (
                                        <div className="mt-3 flex flex-col gap-2 border-t pt-2">
                                            <div className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1"><List className="h-3 w-3"/> List Options</div>
                                            {msg.interactiveOptions.map((opt, i) => (
                                                <button 
                                                    key={i} 
                                                    onClick={() => handleSend(null, opt.title || opt.id)}
                                                    className="w-full flex flex-col text-left py-2 px-3 bg-white text-gray-800 rounded-lg border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors"
                                                >
                                                    <span className="font-semibold text-sm text-[#008069]">{opt.title || opt.id}</span>
                                                    {opt.description && <span className="text-xs text-gray-500 mt-0.5">{opt.description}</span>}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    <div className={`text-[10px] mt-1 text-right ${msg.sender === 'user' ? 'text-green-800/60' : 'text-gray-400'}`}>
                                        {msg.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-white rounded-lg rounded-tl-none p-3 shadow-sm flex items-center gap-2">
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <form onSubmit={handleSend} className="bg-[#f0f2f5] px-2 py-2.5 flex items-center gap-2 z-10">
                        <div className="flex-1 bg-white rounded-full flex items-center px-4 py-2 border border-gray-200 shadow-sm focus-within:border-[#008069] focus-within:ring-1 focus-within:ring-[#008069]/30 transition-all">
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="Message"
                                className="flex-1 bg-transparent outline-none border-none text-sm placeholder-gray-400"
                                disabled={loading}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={!inputValue.trim() || loading}
                            className="bg-[#00a884] text-white p-3 rounded-full shadow-md hover:bg-[#008f6f] disabled:opacity-50 disabled:shadow-none transition-all flex-shrink-0 active:scale-95"
                        >
                            <Send className="h-4 w-4 ml-0.5" />
                        </button>
                    </form>
                </div>
        </div>
    );
}
