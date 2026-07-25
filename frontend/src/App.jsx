import { useEffect, lazy, Suspense } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import Layout from './components/Layout'
import { AuthProvider } from './context/AuthContext'
import { DialogProvider } from './context/DialogContext'
import Contacts from './pages/Contacts'
import WhatsAppConnect from './pages/WhatsAppConnect'
import FlowBuilder from './pages/FlowBuilder'
import Login from './pages/Login'
import AgentLogin from './pages/AgentLogin'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import Templates from './pages/Templates'
import TemplateWizard from './pages/TemplateWizard'
import Broadcast from './pages/Broadcast'
import LiveChat from './pages/LiveChat'
import BotAgents from './pages/BotAgents'
import Settings from './pages/Settings'
import TeamMembers from './pages/TeamMembers'
import PrivacyPolicy from './pages/PrivacyPolicy'
import SSOLogin from './pages/SSOLogin'
import AcceptInvite from './pages/AcceptInvite'
import HelpCenter from './pages/HelpCenter'
import BillingPage from './pages/BillingPage'
import PaymentSuccessPage from './pages/PaymentSuccessPage'
import WhatsAppNumberPage from './pages/WhatsAppNumberPage'
import WhatsAppLinkGenerator from './pages/WhatsAppLinkGenerator'
import WhatsAppRedirect from './pages/WhatsAppRedirect'
import CookieConsent from './components/CookieConsent'
import HomePage from './pages/HomePage'
import TermsOfService from './pages/TermsOfService'
import { loadFacebookSDK } from './services/facebookSdkLoader'

const ScheduledMeetings = lazy(() => import('./pages/ScheduledMeetings'))

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
      <DialogProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/login" element={<Login />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/agent-login" element={<AgentLogin />} />
              <Route path="/accept-invite" element={<AcceptInvite />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/sso" element={<SSOLogin />} />
              <Route path="/payment-success" element={<PaymentSuccessPage />} />
              <Route path="/wa/:data" element={<WhatsAppRedirect />} />
              <Route element={<Layout />}>
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="whatsapp-connect" element={<WhatsAppConnect />} />
                <Route path="whatsapp-number" element={<WhatsAppNumberPage />} />
                <Route path="contacts" element={<Contacts />} />
                <Route path="flow-builder" element={<FlowBuilder />} />
                <Route path="templates" element={<Templates />} />
                <Route path="templates/new" element={<TemplateWizard />} />
                <Route path="templates/industries" element={<Templates defaultView="INDUSTRIES" />} />
                <Route path="broadcast" element={<Broadcast />} />
                <Route path="live-chat" element={<LiveChat />} />
                <Route path="bot-agents" element={<BotAgents />} />
                <Route path="billing" element={<BillingPage />} />
                <Route path="settings" element={<Settings />} />
                <Route path="team-members" element={<TeamMembers />} />
                <Route path="scheduled-meetings" element={<Suspense fallback={<div className="p-8 text-center text-xs font-semibold text-gray-500">Loading Scheduled Meetings...</div>}><ScheduledMeetings /></Suspense>} />
                <Route path="help" element={<HelpCenter />} />
                <Route path="wa-link-generator" element={<WhatsAppLinkGenerator />} />
              </Route>
            </Routes>
            {import.meta.env.VITE_ENABLE_COOKIE_CONSENT === 'true' && <CookieConsent />}
          </BrowserRouter>
        </AuthProvider>
      </DialogProvider>
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


