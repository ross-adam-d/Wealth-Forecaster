export default function PaywallOverlay({ prices, onSubscribe, checkoutLoading, onSignOut }) {
  return (
    <div className="fixed inset-0 z-50 bg-gray-950 flex items-center justify-center px-6">
      <div className="max-w-md w-full space-y-8 text-center">

        {/* Brand */}
        <div>
          <p className="text-xs font-semibold tracking-widest text-brand-400 uppercase mb-2">Wealth Forecaster</p>
          <h1 className="text-2xl font-bold text-white">Your free trial has ended</h1>
          <p className="mt-3 text-sm text-gray-400">
            Subscribe to keep your scenarios, projections, and financial data securely saved and accessible.
          </p>
        </div>

        {/* Plans */}
        <div className="space-y-3">
          <button
            className="btn-primary w-full py-3 text-sm font-semibold"
            disabled={!!checkoutLoading}
            onClick={() => onSubscribe(prices?.monthly, 'monthly')}
          >
            {checkoutLoading === 'monthly' ? 'Redirecting to Stripe…' : 'Subscribe Monthly — $12/mo'}
          </button>
          <button
            className="btn-primary w-full py-3 text-sm font-semibold"
            disabled={!!checkoutLoading}
            onClick={() => onSubscribe(prices?.annual, 'annual')}
          >
            {checkoutLoading === 'annual' ? 'Redirecting to Stripe…' : 'Subscribe Annually — $99/yr'}
          </button>
          <p className="text-xs text-gray-600">Annual plan saves $45 vs monthly (31% off)</p>
        </div>

        {/* Sign out */}
        <div className="pt-2 border-t border-gray-800">
          <button
            className="btn-ghost text-xs text-gray-500"
            onClick={onSignOut}
          >
            Sign out
          </button>
        </div>

      </div>
    </div>
  )
}
