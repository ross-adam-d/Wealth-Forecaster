import { useState, useEffect } from 'react'

/**
 * Reusable step-through tutorial overlay.
 *
 * Props:
 *  - storageKey: localStorage key to track "seen" state
 *  - steps: [{ title, body }]
 *  - onClose: callback when dismissed
 */
export function Tutorial({ steps, onClose }) {
  const [step, setStep] = useState(0)
  const current = steps[step]
  const isLast = step === steps.length - 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-md w-full mx-4 p-6">
        {/* Step indicator */}
        <div className="flex items-center gap-1.5 mb-4">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full flex-1 transition-colors ${i <= step ? 'bg-brand-500' : 'bg-gray-700'}`}
            />
          ))}
        </div>

        <h3 className="text-sm font-semibold text-white mb-2">{current.title}</h3>
        <p className="text-sm text-gray-400 leading-relaxed">{current.body}</p>

        <div className="flex items-center justify-between mt-6">
          <button
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Skip
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="btn-ghost text-xs"
              >
                Back
              </button>
            )}
            <button
              onClick={() => {
                if (isLast) onClose()
                else setStep(s => s + 1)
              }}
              className="btn-primary text-xs"
            >
              {isLast ? 'Got it' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Hook to manage tutorial visibility with localStorage persistence.
 *
 * @param {string} storageKey - localStorage key for this tutorial's "seen" state
 * @param {object} [options]
 * @param {string} [options.waitFor] - another storageKey that must be set before this tutorial auto-shows.
 *   Prevents page tutorials from appearing before the welcome tutorial is dismissed.
 *   Manual re-open via setShow(true) bypasses this check.
 * @returns [showTutorial, setShowTutorial, closeTutorial]
 */
export function useTutorial(storageKey, { waitFor } = {}) {
  const [show, setShow] = useState(() => {
    try {
      if (localStorage.getItem(storageKey)) return false
      // If waitFor is set, don't auto-show until that tutorial has been completed
      if (waitFor && !localStorage.getItem(waitFor)) return false
      return true
    } catch { return true }
  })

  // Poll for the waitFor key to be set (same-tab storage events don't fire)
  useEffect(() => {
    if (show || !waitFor) return
    try {
      if (localStorage.getItem(storageKey)) return // already seen
      if (localStorage.getItem(waitFor)) { setShow(true); return } // already cleared
    } catch {}
    const interval = setInterval(() => {
      try {
        if (localStorage.getItem(waitFor) && !localStorage.getItem(storageKey)) {
          setShow(true)
          clearInterval(interval)
        }
      } catch {}
    }, 300)
    return () => clearInterval(interval)
  }, [show, waitFor, storageKey])

  const close = () => {
    setShow(false)
    try { localStorage.setItem(storageKey, '1') } catch {}
  }

  return [show, setShow, close]
}

/**
 * Small "?" button to re-open a tutorial.
 */
export function TutorialButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-6 h-6 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-xs font-bold transition flex items-center justify-center"
      title="How this page works"
    >
      ?
    </button>
  )
}
