import { useEffect, lazy, Suspense } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import Layout from './components/Layout'
import { AuthProvider } from './context/AuthContext'
import { DialogProvider } from './context/DialogContext'
import { WhatsAppAccountProvider } from './context/WhatsAppAccountContext'
import { PwaInstallProvider } from './context/PwaInstallContext'
import Contacts from './pages/Contacts'
import Login from './pages/Login'
import AgentLogin from './pages/AgentLogin'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import SSOLogin from './pages/SSOLogin'
import AcceptInvite from './pages/AcceptInvite'
import PaymentSuccessPage from './pages/PaymentSuccessPage'
import WhatsAppRedirect from './pages/WhatsAppRedirect'
import CookieConsent from './components/UserPreferencesConsent'
import PwaUpdater from './components/PwaUpdater'
import { PushProvider } from './context/PushContext'
import { MaintenanceGuard } from './components/MaintenanceGuard'
import HomePage from './pages/HomePage'
import TermsOfService from './pages/TermsOfService'
import { loadFacebookSDK } from './services/facebookSdkLoader'

function lazyWithRetry(importer) {
  return lazy(async () => {
    try {
      return await importer()
    } catch (error) {
      const isChunkError = error?.message?.includes('Failed to fetch dynamically imported module') ||
        error?.name === 'ChunkLoadError'
      if (isChunkError) {
        const retryKey = `retry_${window.location.pathname}`
        if (!sessionStorage.getItem(retryKey)) {
          sessionStorage.setItem(retryKey, 'true')
          window.location.reload()
          return new Promise(() => {})
        }
      }
      throw error
    }
  })
}

const FlowBuilder = lazyWithRetry(() => import('./pages/FlowBuilder'))
const Templates = lazyWithRetry(() => import('./pages/Templates'))
const TemplateWizard = lazyWithRetry(() => import('./pages/TemplateWizard'))
const Broadcast = lazyWithRetry(() => import('./pages/Broadcast'))
const LiveChat = lazyWithRetry(() => import('./pages/LiveChat'))
const BotAgents = lazyWithRetry(() => import('./pages/BotAgents'))
const Settings = lazyWithRetry(() => import('./pages/Settings'))
const TeamMembers = lazyWithRetry(() => import('./pages/TeamMembers'))
const HelpCenter = lazyWithRetry(() => import('./pages/HelpCenter'))
const BillingPage = lazyWithRetry(() => import('./pages/BillingPage'))
const WhatsAppConnect = lazyWithRetry(() => import('./pages/WhatsAppConnect'))
const WhatsAppNumberPage = lazyWithRetry(() => import('./pages/WhatsAppNumberPage'))
const WhatsAppLinkGenerator = lazyWithRetry(() => import('./pages/WhatsAppLinkGenerator'))
const ScheduledMeetings = lazyWithRetry(() => import('./pages/ScheduledMeetings'))
const PrivacyPolicy = lazyWithRetry(() => import('./pages/LegalPrivacyNotice'))
const PublicBookingPage = lazyWithRetry(() => import('./pages/PublicBookingPage'))
const MeetingWaitingRoom = lazyWithRetry(() => import('./pages/MeetingWaitingRoom'))

const PageFallback = () => (
  <div className="flex h-[60vh] w-full items-center justify-center">
    <div className="flex items-center space-x-2 text-xs font-semibold text-gray-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      <span>Loading page...</span>
    </div>
  </div>
)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,    // 5 min tak cache fresh rahega
      gcTime: 1000 * 60 * 10,      // 10 min tak memory mein rahega
      refetchOnWindowFocus: false,  // Window focus pe refetch nahi
      refetchOnMount: false,        // Baar baar mount pe refetch nahi
      retry: 1,                     // Sirf 1 baar retry
    },
  },
})

export default function App() {
  useEffect(() => {
    // Rollback logic: If cookie consent is disabled, load the Facebook SDK immediately on startup.
    if (import.meta.env.VITE_ENABLE_COOKIE_CONSENT !== 'true') {
      loadFacebookSDK().catch((err) => {
        console.error('Failed to load Facebook SDK automatically:', err);
      });
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <PushProvider>
        <DialogProvider>
          <AuthProvider>
            <WhatsAppAccountProvider>
              <PwaInstallProvider>
                <BrowserRouter>
                  <MaintenanceGuard productKey="whatsapp_pilot">
                    <Routes>
                      <Route path="/" element={<HomePage />} />
                      <Route path="/terms" element={<TermsOfService />} />
                      <Route path="/login" element={<Login />} />
                      <Route path="/privacy-policy" element={<Suspense fallback={<PageFallback />}><PrivacyPolicy /></Suspense>} />
                      <Route path="/agent-login" element={<AgentLogin />} />
                      <Route path="/accept-invite" element={<AcceptInvite />} />
                      <Route path="/signup" element={<Signup />} />
                      <Route path="/sso" element={<SSOLogin />} />
                      <Route path="/payment-success" element={<PaymentSuccessPage />} />
                      <Route path="/wa/:data" element={<WhatsAppRedirect />} />
                      <Route path="/book/:slug" element={<Suspense fallback={<PageFallback />}><PublicBookingPage /></Suspense>} />
                      <Route path="/book" element={<Suspense fallback={<PageFallback />}><PublicBookingPage /></Suspense>} />
                      <Route path="/join-meeting" element={<Suspense fallback={<PageFallback />}><MeetingWaitingRoom /></Suspense>} />
                      <Route path="/join/:id" element={<Suspense fallback={<PageFallback />}><MeetingWaitingRoom /></Suspense>} />
                      <Route element={<Layout />}>
                        <Route path="dashboard" element={<Dashboard />} />
                        <Route path="whatsapp-connect" element={<Suspense fallback={<PageFallback />}><WhatsAppConnect /></Suspense>} />
                        <Route path="whatsapp-number" element={<Suspense fallback={<PageFallback />}><WhatsAppNumberPage /></Suspense>} />
                        <Route path="contacts" element={<Contacts />} />
                        <Route path="flow-builder" element={<Suspense fallback={<PageFallback />}><FlowBuilder /></Suspense>} />
                        <Route path="templates" element={<Suspense fallback={<PageFallback />}><Templates /></Suspense>} />
                        <Route path="templates/new" element={<Suspense fallback={<PageFallback />}><TemplateWizard /></Suspense>} />
                        <Route path="templates/industries" element={<Suspense fallback={<PageFallback />}><Templates defaultView="INDUSTRIES" /></Suspense>} />
                        <Route path="broadcast" element={<Suspense fallback={<PageFallback />}><Broadcast defaultTab="new" /></Suspense>} />
                        <Route path="broadcast/history" element={<Suspense fallback={<PageFallback />}><Broadcast defaultTab="history" /></Suspense>} />
                        <Route path="live-chat" element={<Suspense fallback={<PageFallback />}><LiveChat /></Suspense>} />
                        <Route path="bot-agents" element={<Suspense fallback={<PageFallback />}><BotAgents /></Suspense>} />
                        <Route path="billing" element={<Suspense fallback={<PageFallback />}><BillingPage /></Suspense>} />
                        <Route path="settings" element={<Suspense fallback={<PageFallback />}><Settings /></Suspense>} />
                        <Route path="team-members" element={<Suspense fallback={<PageFallback />}><TeamMembers /></Suspense>} />
                        <Route path="scheduled-meetings" element={<Suspense fallback={<PageFallback />}><ScheduledMeetings /></Suspense>} />
                        <Route path="help" element={<Suspense fallback={<PageFallback />}><HelpCenter /></Suspense>} />
                        <Route path="wa-link-generator" element={<Suspense fallback={<PageFallback />}><WhatsAppLinkGenerator /></Suspense>} />
                      </Route>
                    </Routes>
                  </MaintenanceGuard>
                  {import.meta.env.VITE_ENABLE_COOKIE_CONSENT === 'true' && <CookieConsent />}
                </BrowserRouter>
              </PwaInstallProvider>
            </WhatsAppAccountProvider>
          </AuthProvider>
        </DialogProvider>
      </PushProvider>
      <PwaUpdater />
      <Toaster
        position="bottom-right"
        expand={false}
        richColors
        closeButton
        toastOptions={{
          style: {
            borderRadius: '12px',
            fontSize: '13px',
            fontFamily: 'Inter, system-ui, sans-serif',
          },
        }}
      />
    </QueryClientProvider>
  )
}


