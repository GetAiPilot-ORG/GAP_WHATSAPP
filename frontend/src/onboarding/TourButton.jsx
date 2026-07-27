import { useEffect, useRef, useState } from 'react'
import { HelpCircle, Map, RefreshCw, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import { useOnboarding } from './onboardingContext'

export default function TourButton({ className = '', compact = false }) {
    const { currentPageTour, isRunning, startCurrentPageTour, startGlobalTour, resetAllTours } = useOnboarding()
    const [open, setOpen] = useState(false)
    const menuRef = useRef(null)

    useEffect(() => {
        const handleClick = (event) => {
            if (!menuRef.current?.contains(event.target)) setOpen(false)
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [])

    const run = async (action) => {
        setOpen(false)
        await action()
    }

    return (
        <div ref={menuRef} className={clsx('group relative', className)} data-tour="tour-menu">
            <button
                type="button"
                onClick={() => setOpen(prev => !prev)}
                disabled={isRunning}
                className={clsx(
                    "inline-flex items-center justify-center gap-2 rounded-full border border-gray-200/80 bg-white/70 text-[14px] font-medium text-gray-800 shadow-[0_2px_8px_rgba(0,0,0,0.04)] backdrop-blur-md ring-1 ring-black/5 transition-all duration-300 hover:border-gray-300 hover:bg-white hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] hover:ring-black/10 active:scale-[0.98] disabled:opacity-50",
                    compact ? "h-8 w-8 sm:h-9 sm:w-9 px-0" : "h-[48px] px-5"
                )}
                aria-label="Show Tour"
            >
                <HelpCircle className="h-4 w-4 sm:h-[18px] sm:w-[18px] text-gray-500 transition-colors group-hover:text-gray-800" />
                {!compact ? <span className="hidden sm:inline">Show Tour</span> : null}
            </button>
            {compact ? (
                <span className="pointer-events-none absolute right-0 top-full z-[120] mt-2 whitespace-nowrap rounded-lg border border-gray-100 bg-white px-3 py-2 text-[13px] font-medium text-gray-800 opacity-0 shadow-lg shadow-gray-900/5 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    Show Tour
                </span>
            ) : null}

            {open ? (
                <div className="absolute left-0 sm:left-auto right-0 sm:right-0 z-[9999] mt-3 w-[280px] overflow-hidden rounded-[20px] border border-gray-200/60 bg-white/80 p-2 shadow-[0_16px_40px_rgba(0,0,0,0.08)] backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
                    <button
                        type="button"
                        onClick={() => run(startCurrentPageTour)}
                        disabled={!currentPageTour || isRunning}
                        className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left text-sm text-gray-700 transition-all hover:bg-black/5 active:bg-black/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 shadow-sm ring-1 ring-blue-100">
                            <Map className="h-4 w-4" />
                        </div>
                        <span>
                            <span className="block text-[14px] font-semibold text-gray-900">Start page tour</span>
                            <span className="block mt-0.5 text-[13px] text-gray-500">Current page ka quick guide.</span>
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => run(startGlobalTour)}
                        disabled={isRunning}
                        className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left text-sm text-gray-700 transition-all hover:bg-black/5 active:bg-black/10 disabled:opacity-50"
                    >
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-50 text-purple-600 shadow-sm ring-1 ring-purple-100">
                            <Sparkles className="h-4 w-4" />
                        </div>
                        <span>
                            <span className="block text-[14px] font-semibold text-gray-900">Start app tour</span>
                            <span className="block mt-0.5 text-[13px] text-gray-500">Main setup guide dobara dekho.</span>
                        </span>
                    </button>
                    <div className="my-1 h-px bg-gray-100/80 mx-2" />
                    <button
                        type="button"
                        onClick={() => {
                            resetAllTours()
                            setOpen(false)
                        }}
                        disabled={isRunning}
                        className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left text-sm text-gray-700 transition-all hover:bg-black/5 active:bg-black/10 disabled:opacity-50"
                    >
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 ring-1 ring-gray-200">
                            <RefreshCw className="h-4 w-4" />
                        </div>
                        <span>
                            <span className="block text-[14px] font-semibold text-gray-900">Reset tour history</span>
                            <span className="block mt-0.5 text-[13px] text-gray-500">First-run guide fir se dekhein.</span>
                        </span>
                    </button>
                </div>
            ) : null}
        </div>
    )
}
