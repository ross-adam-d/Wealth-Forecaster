import { useState } from 'react'

export default function TrialBanner({ trialDaysLeft, prices, onSubscribe, checkoutLoading, error }) {
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem('trialBannerDismissed') === '1'
  )

  if (dismissed) return null

  function dismiss() {
    sessionStorage.setItem('trialBannerDismissed', '1')
    setDismissed(true)
  }

  const urgent = trialDaysLeft <= 2

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 border-b ${
      urgent
        ? 'bg-red-900/60 border-red-800'
        : 'bg-amber-900/50 border-amber-800'
    }`}>
      <span className={`text-sm flex-1 min-w-0 ${urgent ? 'text-red-200' : 'text-amber-200'}`}>
        <span className="font-semibold">
          {trialDaysLeft === 1 ? 'Last day' : `${trialDaysLeft} days`} left in your free trial
        </span>
        {' — subscribe to keep your scenarios and projections.'}
      </span>
      <button
        className="btn-primary text-xs whitespace-nowrap flex-shrink-0"
        disabled={!!checkoutLoading}
        onClick={() => onSubscribe(prices?.monthly, 'monthly')}
      >
        {checkoutLoading === 'monthly' ? 'Redirecting…' : 'Subscribe — $12/mo'}
      </button>
      {error && (
        <span className="text-xs text-red-300 whitespace-nowrap flex-shrink-0">{error}</span>
      )}
      <button
        onClick={dismiss}
        className={`flex-shrink-0 p-1 rounded transition-colors ${
          urgent
            ? 'text-red-400 hover:text-red-200 hover:bg-red-800/50'
            : 'text-amber-400 hover:text-amber-200 hover:bg-amber-800/50'
        }`}
        aria-label="Dismiss"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1="3" y1="3" x2="11" y2="11"/>
          <line x1="11" y1="3" x2="3" y2="11"/>
        </svg>
      </button>
    </div>
  )
}
