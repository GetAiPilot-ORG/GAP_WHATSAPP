import { useState, useEffect, useMemo, useRef } from 'react';
import { io } from "socket.io-client";
import { AlertCircle, CheckCircle, Loader2, LogOut } from 'lucide-react';
import QRCode from "react-qr-code";
import { useAuth } from '../context/AuthContext';
import Modal from './Modal';

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// Connect to backend
const socket = io(BACKEND_BASE, {
    autoConnect: false,
    transports: ['polling', 'websocket'],
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
});

const WhatsAppLogin = ({ onAccountConnected }) => {
    const { memberProfile, user } = useAuth();
    const [qrCode, setQrCode] = useState('');
    const [status, setStatus] = useState('idle'); // idle | scanning | connected | ready | logging_out
    const [sessionId, setSessionId] = useState('');
    const [isRequested, setIsRequested] = useState(false);
    const [isConnectionLocked, setIsConnectionLocked] = useState(false);
    const [connectedAccount, setConnectedAccount] = useState('');
    const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
    const onAccountConnectedRef = useRef(onAccountConnected);
    const organizationIdRef = useRef('');
    const isRequestedRef = useRef(false);
    const isConnectionLockedRef = useRef(false);
    const organizationId = useMemo(
        () => memberProfile?.organization_id || user?.user_metadata?.organization_id || '',
        [memberProfile?.organization_id, user?.user_metadata?.organization_id]
    );

    useEffect(() => {
        onAccountConnectedRef.current = onAccountConnected;
    }, [onAccountConnected]);

    useEffect(() => {
        organizationIdRef.current = organizationId;
    }, [organizationId]);

    useEffect(() => {
        isRequestedRef.current = isRequested;
    }, [isRequested]);

    useEffect(() => {
        isConnectionLockedRef.current = isConnectionLocked;
    }, [isConnectionLocked]);

    useEffect(() => {
        if (organizationId && sessionId && socket.connected) {
            socket.emit('join_session', sessionId, organizationId);
        }
    }, [organizationId, sessionId]);

    useEffect(() => {
        const storedSession = localStorage.getItem('whatsapp_session_id') || `session_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('whatsapp_session_id', storedSession);
        setSessionId(storedSession);
        if (!socket.connected) {
            socket.connect();
        }

        if (socket.connected) {
            if (!isConnectionLockedRef.current) setStatus('ready');
            socket.emit('join_session', storedSession, organizationIdRef.current);
        }

        socket.on('connect', () => {
            if (!isConnectionLockedRef.current) setStatus('ready');
            socket.emit('join_session', storedSession, organizationIdRef.current);
        });

        socket.on('qr', (qr) => {
            setIsRequested(true);
            setIsConnectionLocked(true);
            setQrCode(qr);
            setStatus('scanning');
        });

        socket.on('status', (s) => {
            if (s === 'connected') {
                setIsRequested(false);
                setIsConnectionLocked(false);
                setQrCode('');
                setStatus('connected');
            } else if (s === 'ready' || s === 'disconnected') {
                if (isConnectionLockedRef.current || isRequestedRef.current) {
                    setStatus('connecting');
                    setQrCode('');
                } else {
                    setStatus('ready');
                    setQrCode('');
                    setIsRequested(false);
                }
            } else {
                setStatus(s);
            }
        });

        socket.on('connected_account', (acc) => {
            setConnectedAccount(acc);
            onAccountConnectedRef.current?.(acc);
        });

        socket.on('session_not_found', () => {
            if (isConnectionLockedRef.current || isRequestedRef.current) {
                setStatus('connecting');
            } else {
                setStatus('ready');
            }
        });

        const resetConnectionAttempt = () => {
            setIsRequested(false);
            setIsConnectionLocked(false);
            setQrCode('');
            setStatus('ready');
        };

        socket.on('session_cleared', resetConnectionAttempt);
        socket.on('reconnect_failed', resetConnectionAttempt);
        socket.on('conflict_detected', resetConnectionAttempt);

        socket.on('connection.update', (update) => {
            if (update?.connection === 'connecting') {
                setStatus('connecting');
            }
        });

        socket.on('error', (err) => {
            console.error("Socket error", err);
        });

        return () => {
            socket.off('connect');
            socket.off('qr');
            socket.off('status');
            socket.off('connected_account');
            socket.off('session_not_found');
            socket.off('session_cleared');
            socket.off('reconnect_failed');
            socket.off('conflict_detected');
            socket.off('connection.update');
            socket.off('error');
        };
    }, []);

    const handleGenerateQR = () => {
        if (isConnectionLocked || isRequested || status === 'scanning' || status === 'connecting') return;
        setIsRequested(true);
        setIsConnectionLocked(true);
        setStatus('scanning');
        setQrCode('');
        socket.emit('request_qr', sessionId, organizationId);
    };

    const handleConnectAnother = () => {
        const nextSessionId = `session_${Math.random().toString(36).slice(2, 11)}`;
        localStorage.setItem('whatsapp_session_id', nextSessionId);
        setSessionId(nextSessionId);
        setConnectedAccount('');
        setQrCode('');
        setIsRequested(true);
        setIsConnectionLocked(true);
        setStatus('scanning');

        if (!socket.connected) socket.connect();
        socket.emit('join_session', nextSessionId, organizationId);
        socket.emit('request_qr', nextSessionId, organizationId);
    };

    const performLogout = async () => {
        setIsLogoutConfirmOpen(false);
        setStatus('logging_out');
        socket.emit('logout', sessionId);

        setConnectedAccount('');
        setQrCode('');
        setIsRequested(false);
        setIsConnectionLocked(false);

        try {
            await fetch(`${BACKEND_BASE}/api/wa/logout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId })
            });
        } catch (err) {
            console.error("REST logout failed:", err);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center p-6 bg-white rounded-xl shadow-sm border border-gray-100 max-w-sm mx-auto w-full">
            <div className="mb-6 text-center">
                <h3 className="text-lg font-semibold text-gray-900">
                    {status === 'connected' ? 'Account Connected' : 
                     status === 'logging_out' ? 'Logging out...' : 'Scan to Connect'}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                    {status === 'connected' 
                        ? 'Your WhatsApp is linked and active.' 
                        : status === 'logging_out'
                        ? 'Clearing your session...'
                        : status === 'connecting'
                        ? 'QR scanned. Finishing secure connection...'
                        : 'Open WhatsApp > Linked Devices > Link a Device'}
                </p>
            </div>

            <div className="relative flex items-center justify-center w-64 h-64 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200 overflow-hidden">
                {(status === 'idle' || status === 'logging_out') && (
                    <div className="flex flex-col items-center text-gray-400 p-4 text-center">
                        <Loader2 className="h-8 w-8 animate-spin mb-2" />
                        <span className="text-sm font-medium">
                            {status === 'logging_out' ? 'Cleaning up...' : 'Connecting to server...'}
                        </span>
                    </div>
                )}

                {status === 'ready' && (
                    <div className="flex flex-col items-center text-gray-600 p-4 text-center animate-in fade-in transition-all">
                        <button
                            onClick={handleGenerateQR}
                            disabled={isConnectionLocked || isRequested}
                            className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors shadow-md active:scale-95"
                        >
                            Generate QR Code
                        </button>
                    </div>
                )}

                {(status === 'connecting' || (status === 'scanning' && !qrCode)) && (
                    <div className="flex flex-col items-center text-gray-400">
                        <Loader2 className="h-8 w-8 animate-spin mb-2" />
                        <span className="text-sm">{status === 'connecting' ? 'Connecting WhatsApp...' : 'Generating QR...'}</span>
                        {status === 'connecting' && (
                            <span className="mt-2 max-w-48 text-center text-xs leading-5 text-gray-400">
                                Please keep this page open. Do not generate another QR.
                            </span>
                        )}
                    </div>
                )}

                {status === 'scanning' && qrCode && (
                    <div className="p-2 bg-white rounded-lg shadow-sm animate-in zoom-in duration-300">
                        <QRCode
                            value={qrCode}
                            size={220}
                            style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                            viewBox={`0 0 256 256`}
                        />
                    </div>
                )}

                {status === 'connected' && (
                    <div className="flex flex-col items-center text-green-600 animate-in fade-in zoom-in duration-300">
                        <CheckCircle className="h-16 w-16 mb-4" />
                        <span className="font-semibold text-lg text-center">Connected!</span>
                        {connectedAccount && (
                            <span className="text-sm text-gray-500 mt-2">+{connectedAccount}</span>
                        )}
                    </div>
                )}
            </div>

            <div className="mt-8 w-full flex flex-col gap-3">
                <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
                    <div className={`h-2 w-2 rounded-full ${
                        status === 'idle' || status === 'logging_out' ? 'bg-yellow-400' :
                        status === 'ready' ? 'bg-blue-400' :
                        status === 'scanning' || status === 'connecting' ? 'bg-orange-400' :
                        'bg-green-400'
                    }`} />
                    <span className="capitalize">{status === 'scanning' ? 'Waiting for Scan' : status}</span>
                </div>

                {status === 'connected' && (
                    <>
                        <button
                            onClick={handleConnectAnother}
                            className="w-full py-2 px-4 border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg text-sm font-semibold transition-colors mt-2"
                        >
                            Connect another number
                        </button>
                        <button
                            onClick={() => setIsLogoutConfirmOpen(true)}
                            className="w-full py-2 px-4 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors"
                        >
                            Disconnect / Logout
                        </button>
                    </>
                )}
            </div>
            
            <div className="mt-4 text-[10px] text-gray-300 font-mono text-center">
                SID: {sessionId}
            </div>

            <Modal
                isOpen={isLogoutConfirmOpen}
                onClose={() => setIsLogoutConfirmOpen(false)}
                title="Disconnect WhatsApp session?"
                maxWidth="max-w-lg"
            >
                <div className="space-y-5">
                    <div className="flex items-start gap-3 rounded-lg border border-red-100 bg-red-50 p-4 text-red-900">
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                        <div>
                            <p className="text-sm font-semibold">This QR session will be logged out.</p>
                            <p className="mt-1 text-sm leading-6 text-red-800">
                                The connected number {connectedAccount ? <span className="font-semibold">+{connectedAccount}</span> : 'for this session'} will stop receiving chat and flow automation until you scan QR again.
                            </p>
                        </div>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                        <p className="text-xs font-bold uppercase tracking-wide text-gray-600">Before you disconnect</p>
                        <ul className="mt-2 space-y-1.5 text-sm leading-6 text-gray-600">
                            <li>Active flows will not reply from this QR number after logout.</li>
                            <li>Existing chat history in the app will remain available.</li>
                            <li>You can connect the same number again by generating a fresh QR.</li>
                        </ul>
                    </div>

                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        <button
                            type="button"
                            onClick={() => setIsLogoutConfirmOpen(false)}
                            className="inline-flex h-10 items-center justify-center rounded-full border border-gray-300 bg-white px-5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                        >
                            Keep connected
                        </button>
                        <button
                            type="button"
                            onClick={performLogout}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700"
                        >
                            <LogOut className="h-4 w-4" />
                            Disconnect session
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default WhatsAppLogin;
