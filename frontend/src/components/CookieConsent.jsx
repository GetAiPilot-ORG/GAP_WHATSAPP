import { useState, useEffect } from 'react';
import { Shield, Settings, Check, X } from 'lucide-react';

const STORAGE_KEY = 'gap_cookie_consent';
const CURRENT_VERSION = 1;

const DEFAULT_PREFERENCES = {
  necessary: true,
  analytics: false,
  integrations: false,
  version: CURRENT_VERSION,
};

export default function CookieConsent({ onConsentChange }) {
  const [isVisible, setIsVisible] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // If version matches, we have a valid consent
        if (parsed && parsed.version === CURRENT_VERSION) {
          setPreferences(parsed);
          setIsVisible(false);
          return;
        }
      }
      // If no stored consent or old version, show banner
      setIsVisible(true);
    } catch (e) {
      setIsVisible(true);
    }
  }, []);

  const savePreferences = (updatedPrefs) => {
    try {
      const prefsWithMeta = {
        ...updatedPrefs,
        necessary: true,
        version: CURRENT_VERSION,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefsWithMeta));
      setPreferences(prefsWithMeta);
      setIsVisible(false);
      if (onConsentChange) {
        onConsentChange(prefsWithMeta);
      }
    } catch (e) {
      console.error('Failed to save cookie preferences', e);
    }
  };

  const handleAcceptAll = () => {
    savePreferences({
      necessary: true,
      analytics: true,
      integrations: true,
    });
  };

  const handleRejectAll = () => {
    savePreferences({
      necessary: true,
      analytics: false,
      integrations: false,
    });
  };

  const handleSaveCustom = () => {
    savePreferences(preferences);
  };

  const togglePreference = (key) => {
    if (key === 'necessary') return;
    setPreferences((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-6 left-6 right-6 md:left-auto md:right-6 md:max-w-md z-50 animate-in slide-in-from-bottom-8 duration-300">
      <div className="bg-white rounded-2xl shadow-[0_10px_30px_-5px_rgba(0,0,0,0.1),0_0_20px_0_rgba(0,0,0,0.03)] border border-gray-100 p-5 md:p-6 transition-all duration-300">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Shield className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-gray-900">Cookie Consent</h3>
            <p className="mt-1.5 text-xs md:text-sm text-gray-600 leading-relaxed">
              We use cookies to optimize site functionality, run analytics, and enable official integrations like Meta onboarding.
            </p>
          </div>
        </div>

        {showCustomize ? (
          <div className="mt-5 space-y-4 border-t border-gray-100 pt-4 animate-in fade-in duration-200">
            <div className="space-y-3">
              {/* Necessary */}
              <div className="flex items-start justify-between gap-3 p-2 rounded-xl hover:bg-gray-50/50">
                <div>
                  <label className="text-xs font-semibold text-gray-900">Strictly Necessary</label>
                  <p className="text-[11px] text-gray-500 mt-0.5">Required for authentication, session stability, and security.</p>
                </div>
                <input
                  type="checkbox"
                  checked
                  disabled
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-not-allowed opacity-60"
                />
              </div>

              {/* Integrations */}
              <div
                className="flex items-start justify-between gap-3 p-2 rounded-xl hover:bg-gray-50/50 cursor-pointer"
                onClick={() => togglePreference('integrations')}
              >
                <div>
                  <label className="text-xs font-semibold text-gray-900 cursor-pointer">Integrations</label>
                  <p className="text-[11px] text-gray-500 mt-0.5">Enables Meta Cloud API onboarding SDKs to connect your WhatsApp numbers.</p>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.integrations}
                  onChange={() => { }}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </div>

              {/* Analytics */}
              <div
                className="flex items-start justify-between gap-3 p-2 rounded-xl hover:bg-gray-50/50 cursor-pointer"
                onClick={() => togglePreference('analytics')}
              >
                <div>
                  <label className="text-xs font-semibold text-gray-900 cursor-pointer">Analytics</label>
                  <p className="text-[11px] text-gray-500 mt-0.5">Helps us understand how visitors interact with the dashboard.</p>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.analytics}
                  onChange={() => { }}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </div>
            </div>

            <div className="flex gap-2.5 pt-2 border-t border-gray-50">
              <button
                type="button"
                onClick={() => setShowCustomize(false)}
                className="flex-1 py-2 px-3 border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl text-xs font-semibold transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleSaveCustom}
                className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm"
              >
                Save Choice
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => setShowCustomize(true)}
              className="inline-flex items-center justify-center gap-1.5 py-2 px-3.5 border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl text-xs font-semibold transition-colors"
            >
              <Settings className="h-3.5 w-3.5" />
              Customize
            </button>
            <div className="flex flex-1 gap-2.5 sm:justify-end">
              <button
                type="button"
                onClick={handleRejectAll}
                className="flex-1 sm:flex-none py-2 px-3.5 border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl text-xs font-semibold transition-colors"
              >
                Reject All
              </button>
              <button
                type="button"
                onClick={handleAcceptAll}
                className="flex-1 sm:flex-none py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm shadow-blue-50"
              >
                Accept All
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
