import React from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { X, RefreshCw } from 'lucide-react'

export default function PwaUpdater() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered:', r)
    },
    onRegisterError(error) {
      console.log('SW registration error', error)
    },
  })

  const close = () => {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  if (!offlineReady && !needRefresh) {
    return null
  }

  return (
    <div className="fixed bottom-4 left-4 z-[9999] animate-in slide-in-from-bottom-5">
      <div className="bg-white border border-gray-200 rounded-lg shadow-xl p-4 max-w-sm w-full relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-green-500"></div>
        <button 
          onClick={close} 
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 p-1"
        >
          <X size={16} />
        </button>
        
        <div className="pr-6">
          <h3 className="font-semibold text-gray-900 mb-1 text-sm">
            {offlineReady ? 'App ready to work offline' : 'New update available!'}
          </h3>
          <p className="text-xs text-gray-500 mb-3">
            {offlineReady
              ? 'You can now use this application without an internet connection.'
              : 'A new version of the app is available. Click reload to apply the update.'}
          </p>
          
          {needRefresh && (
            <button
              onClick={() => updateServiceWorker(true)}
              className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors"
            >
              <RefreshCw size={12} />
              Reload & Update
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
