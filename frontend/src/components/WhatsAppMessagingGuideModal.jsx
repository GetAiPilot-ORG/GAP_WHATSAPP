import React from 'react'
import {
    X,
    Clock,
    FileText,
    QrCode,
    Sparkles,
    CheckCircle2,
    AlertCircle,
    ArrowRight,
    MessageSquare,
    ShieldCheck,
    Zap,
    ExternalLink,
    HelpCircle
} from 'lucide-react'
import { Link } from 'react-router-dom'

export default function WhatsAppMessagingGuideModal({ isOpen, onClose }) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10 animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="relative border-b border-gray-100 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 px-6 py-5 text-white">
                    <button
                        type="button"
                        onClick={onClose}
                        className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
                        aria-label="Close"
                    >
                        <X className="h-5 w-5" />
                    </button>
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
                        <Sparkles className="h-3.5 w-3.5 text-emerald-200" />
                        Official Meta WhatsApp Rules
                    </div>
                    <h2 className="mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl">
                        How WhatsApp Cloud API Messaging Works
                    </h2>
                    <p className="mt-1 text-xs sm:text-sm text-emerald-100 leading-relaxed">
                        Learn how the 24-hour service window and template messages work to avoid message failures.
                    </p>
                </div>

                {/* Body Content */}
                <div className="max-h-[75vh] overflow-y-auto p-6 space-y-6 text-gray-800">
                    {/* Core Rule 1: The 24-Hour Customer Care Window */}
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 sm:p-5">
                        <div className="flex items-start gap-3.5">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                                <Clock className="h-5 w-5" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-base font-bold text-gray-950">1. The 24-Hour Customer Care Window</h3>
                                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                                        Freeform Chat
                                    </span>
                                </div>
                                <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-gray-600">
                                    When a customer sends a message to your WhatsApp number, Meta opens a <strong>24-hour session window</strong>.
                                </p>
                                <ul className="mt-2.5 space-y-1.5 text-xs sm:text-sm text-gray-700">
                                    <li className="flex items-center gap-2">
                                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                                        <span>You and your AI Bots can send <strong>unlimited free text, images, videos, audio, and documents</strong>.</span>
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                                        <span>Every incoming message from the customer <strong>resets the 24-hour timer</strong> back to full.</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Core Rule 2: Initiating Contact with Templates */}
                    <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 sm:p-5">
                        <div className="flex items-start gap-3.5">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                                <FileText className="h-5 w-5" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-base font-bold text-gray-950">2. Reaching Out First? Use Meta-Approved Templates</h3>
                                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-800">
                                        Outbound Rule
                                    </span>
                                </div>
                                <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-gray-600">
                                    Meta does <strong>not</strong> allow businesses to send regular freeform text messages to contacts who haven't messaged in the last 24 hours (or new contacts).
                                </p>
                                <div className="mt-3 rounded-lg border border-blue-200/60 bg-white p-3 text-xs leading-relaxed text-blue-950">
                                    <strong>How to start a new chat:</strong>
                                    <ol className="mt-1.5 list-decimal pl-4 space-y-1 text-gray-700">
                                        <li>Create and submit a message template in <Link to="/templates" onClick={onClose} className="font-semibold text-blue-600 underline hover:text-blue-700">Templates</Link> (Utility or Marketing).</li>
                                        <li>Once approved by Meta, click <strong>Send Template</strong> in LiveChat or Broadcast.</li>
                                        <li>As soon as the contact replies to your template, the <strong>24-hour free chat window unlocks!</strong></li>
                                    </ol>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Core Rule 3: Customer-Initiated Conversations (Inbound) */}
                    <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-4 sm:p-5">
                        <div className="flex items-start gap-3.5">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white shadow-sm">
                                <QrCode className="h-5 w-5" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-base font-bold text-gray-950">3. Get Customers to Message You First</h3>
                                    <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-800">
                                        Best Practice
                                    </span>
                                </div>
                                <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-gray-600">
                                    You don't need templates if customers initiate the conversation! Use our tools to get incoming messages easily:
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <Link
                                        to="/whatsapp-link-generator"
                                        onClick={onClose}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-white px-3 py-1.5 text-xs font-semibold text-purple-700 shadow-xs hover:bg-purple-100/50"
                                    >
                                        <QrCode className="h-3.5 w-3.5" />
                                        WhatsApp Link & QR Generator &rarr;
                                    </Link>
                                    <Link
                                        to="/flow-builder"
                                        onClick={onClose}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-white px-3 py-1.5 text-xs font-semibold text-purple-700 shadow-xs hover:bg-purple-100/50"
                                    >
                                        <Zap className="h-3.5 w-3.5" />
                                        Auto-Reply Flows &rarr;
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Summary Matrix Table */}
                    <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-3">Quick Reference Summary</h4>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="border-b border-gray-200 text-gray-500 font-semibold">
                                        <th className="pb-2">Scenario</th>
                                        <th className="pb-2">Can Send Freeform Text?</th>
                                        <th className="pb-2">Action Required</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200/60 text-gray-700">
                                    <tr>
                                        <td className="py-2.5 font-medium text-gray-900">Contact messaged in last 24 hrs</td>
                                        <td className="py-2.5 text-emerald-600 font-bold">Yes (Unlimited)</td>
                                        <td className="py-2.5 text-gray-600">Reply freely or let AI handle it</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2.5 font-medium text-gray-900">Brand new contact (0 inbound msgs)</td>
                                        <td className="py-2.5 text-rose-600 font-bold">No</td>
                                        <td className="py-2.5 text-gray-600">Send an approved Template message</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2.5 font-medium text-gray-900">24 hours passed since customer reply</td>
                                        <td className="py-2.5 text-rose-600 font-bold">No</td>
                                        <td className="py-2.5 text-gray-600">Send an approved Template to re-open</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
                    <Link
                        to="/help"
                        onClick={onClose}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900"
                    >
                        <HelpCircle className="h-4 w-4" />
                        Open Help Center FAQs
                    </Link>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex w-full sm:w-auto items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors"
                    >
                        Got it, thanks!
                    </button>
                </div>
            </div>
        </div>
    )
}
