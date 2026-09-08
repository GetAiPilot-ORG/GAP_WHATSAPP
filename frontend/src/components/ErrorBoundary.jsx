import React from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        // Safe logging without leaking sensitive data
        if (process.env.NODE_ENV !== 'production') {
            console.error('[ErrorBoundary caught error]:', error, errorInfo);
        } else {
            console.error('[ErrorBoundary caught error]:', error?.message || 'Unknown error');
        }
    }

    handleReload = () => {
        try {
            // Clear any chunk retry flags
            if (typeof window !== 'undefined' && window.sessionStorage) {
                Object.keys(window.sessionStorage).forEach((k) => {
                    if (k.startsWith('gap_chunk_retry_')) {
                        window.sessionStorage.removeItem(k);
                    }
                });
            }
        } catch (e) {
            // Ignore
        }
        if (typeof window !== 'undefined') {
            window.location.reload();
        }
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen w-full flex items-center justify-center bg-[#f5f7fa] p-4 font-sans">
                    <div className="max-w-md w-full bg-white rounded-2xl p-6 md:p-8 shadow-[0_12px_40px_rgba(0,0,0,0.08)] border border-gray-100 text-center flex flex-col items-center">
                        <div className="w-14 h-14 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center mb-4 ring-8 ring-amber-50/50">
                            <AlertTriangle className="w-7 h-7" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 mb-2">
                            Something went wrong
                        </h2>
                        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                            An unexpected issue occurred while loading this view. Click reload to refresh the application.
                        </p>
                        <button
                            type="button"
                            onClick={this.handleReload}
                            className="inline-flex items-center justify-center gap-2 bg-[#0070d1] hover:bg-[#0064b7] text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm active:scale-95"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Reload Application
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
