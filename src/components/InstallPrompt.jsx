import { useState, useEffect } from 'react'

// Already running as an installed PWA?
function isStandalone() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.navigator.standalone === true
  )
}

function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream
}

/**
 * "Add to Home Screen" entry point for mobile.
 * - Android / Chromium: captures `beforeinstallprompt` and fires the native prompt.
 * - iOS Safari: no install API exists, so we show the Share-sheet instructions.
 * Renders nothing when already installed or when the browser can't install.
 */
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [installed, setInstalled] = useState(() => isStandalone())
  const [showIosHelp, setShowIosHelp] = useState(false)

  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferredPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const ios = isIOS()

  // Hide when installed, or when there's nothing we can do (non-iOS browser
  // that hasn't offered an install prompt).
  if (installed) return null
  if (!ios && !deferredPrompt) return null

  const handleClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') setInstalled(true)
      setDeferredPrompt(null)
    } else if (ios) {
      setShowIosHelp((v) => !v)
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-brand-400 transition-colors hover:bg-gray-800 hover:text-white"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
          <rect x="3" y="1.5" width="10" height="13" rx="2" />
          <line x1="8" y1="5" x2="8" y2="9.5" />
          <line x1="5.75" y1="7.25" x2="10.25" y2="7.25" />
        </svg>
        Add to Home Screen
      </button>
      {ios && showIosHelp && (
        <p className="px-3 pb-2 pt-1 text-xs leading-relaxed text-gray-400">
          Tap the <span className="text-gray-200">Share</span> icon (the square with an up-arrow)
          in Safari's toolbar, then choose <span className="text-gray-200">"Add to Home Screen"</span>.
        </p>
      )}
    </div>
  )
}
