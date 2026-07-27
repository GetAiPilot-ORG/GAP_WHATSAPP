import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, Loader2 } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

async function getFunctionErrorMessage(error, fallback) {
    try {
        if (error?.context?.json) {
            const body = await error.context.json()
            return body?.error || body?.message || error.message || fallback
        }
    } catch {
        // Keep the fallback path small and predictable.
    }
    return error?.message || fallback
}

export default function PaymentSuccessPage() {
    const navigate = useNavigate()
    const { user, refreshProfile } = useAuth()
    const [verifying, setVerifying] = useState(true)
    const [plan, setPlan] = useState(null)
    const [walletRecharge, setWalletRecharge] = useState(null)
    const [scheduledDowngrade, setScheduledDowngrade] = useState(null)
    const [error, setError] = useState('')

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const paymentLinkId = params.get('razorpay_payment_link_id')
        const kind = params.get('kind')

        const verify = async () => {
            try {
                if (paymentLinkId) {
                    const functionName = kind === 'wallet'
                        ? 'verify-whatsapp-wallet-recharge'
                        : 'verify-whatsapp-subscription'
                    const { data, error: fnError } = await supabase.functions.invoke(functionName, {
                        body: { razorpayPaymentLinkId: paymentLinkId },
                    })
                    if (fnError) throw new Error(await getFunctionErrorMessage(fnError, 'Payment verification failed'))
                    if (data?.plan) setPlan(data.plan)
                    if (data?.scheduled_downgrade) setScheduledDowngrade(data)
                    if (kind === 'wallet') setWalletRecharge(data)
                    
                    try {
                        localStorage.removeItem(`gap_billing_overview_${user?.id || 'default'}`)
                    } catch (e) {
                        console.warn('Failed to clear cached billing:', e)
                    }
                }
                await refreshProfile()
            } catch (err) {
                console.error('Verification error:', err)
                setError(err.message || 'Payment verification failed')
            } finally {
                setVerifying(false)
            }
        }

        verify()
    }, [refreshProfile, user?.id])

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-10 max-w-md w-full text-center shadow-sm">
                {verifying ? (
                    <>
                        <Loader2 className="w-12 h-12 text-green-500 animate-spin mx-auto mb-4" />
                        <h2 className="text-xl font-semibold text-gray-900 mb-2">Verifying payment...</h2>
                        <p className="text-sm text-gray-500">Please wait while we confirm your subscription.</p>
                    </>
                ) : error ? (
                    <>
                        <Loader2 className="w-12 h-12 text-red-500 mx-auto mb-4" />
                        <h2 className="text-xl font-semibold text-gray-900 mb-2">Verification needs attention</h2>
                        <p className="text-sm text-red-600 mb-8">{error}</p>
                        <button
                            onClick={() => navigate('/billing')}
                            className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors"
                        >
                            Go to Billing
                        </button>
                    </>
                ) : (
                    <>
                        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border-4 border-green-500">
                            <CheckCircle className="h-8 w-8 text-green-500" strokeWidth={2.5} />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-8 px-4 leading-snug">
                            Your order has been<br />successfully submitted
                        </h2>

                        <div className="text-sm text-left mb-4">
                            <div className="flex justify-between py-4 border-b border-gray-100">
                                <span className="text-gray-500">Order ID</span>
                                <span className="font-medium text-gray-900">{new URLSearchParams(window.location.search).get('razorpay_payment_link_id') || 'TXN_SUCCESS'}</span>
                            </div>
                            <div className="flex justify-between py-4 border-b border-gray-100">
                                <span className="text-gray-500">Payment Method</span>
                                <span className="font-medium text-gray-900">Razorpay</span>
                            </div>
                            <div className="flex justify-between py-4 border-b border-gray-100">
                                <span className="text-gray-500">Date & Time</span>
                                <span className="font-medium text-gray-900">{new Date().toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '')}</span>
                            </div>
                            <div className="flex justify-between py-6 items-center">
                                <span className="font-bold text-gray-900 text-base">Total</span>
                                <span className="font-bold text-gray-900 text-xl">
                                    {walletRecharge?.amount_paise 
                                        ? `₹ ${(walletRecharge.amount_paise / 100).toLocaleString('en-IN')}` 
                                        : (plan ? 'Paid via Plan' : '₹ 0')}
                                </span>
                            </div>
                        </div>

                        <button
                            onClick={() => navigate(walletRecharge || scheduledDowngrade ? '/billing' : '/dashboard')}
                            className="w-full py-4 bg-[#1a1a1a] text-white rounded-xl text-sm font-semibold hover:bg-black transition-colors"
                        >
                            Go to my account
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}
