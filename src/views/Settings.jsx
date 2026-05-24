import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase.js'

const API = 'https://wealthspan.au/api'

export default function Settings({ user }) {
  const [profile, setProfile] = useState(null)
  const [prices, setPrices] = useState(null)
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [error, setError] = useState(null)

  const justSubscribed = new URLSearchParams(window.location.search).get('subscribed') === 'true'

  useEffect(() => {
    if (!user) return
    Promise.all([
      fetch(`${API}/profile?userId=${user.id}`).then(r => r.json()),
      fetch(`${API}/prices`).then(r => r.json()),
    ])
      .then(([profileData, pricesData]) => {
        setProfile(profileData)
        setPrices(pricesData)
      })
      .catch(() => setError('Failed to load account info'))
      .finally(() => setLoading(false))
  }, [user])

  async function subscribe(priceId, plan) {
    if (!priceId) return
    setCheckoutLoading(plan)
    setError(null)
    try {
      const res = await fetch(`${API}/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, userId: user.id, email: user.email }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      window.location.href = data.url
    } catch (e) {
      setError(e.message)
      setCheckoutLoading(null)
    }
  }

  async function openPortal() {
    setPortalLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/billing-portal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      window.location.href = data.url
    } catch (e) {
      setError(e.message)
      setPortalLoading(false)
    }
  }

  return (
    <div className="px-6 py-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-lg font-semibold text-white">Settings</h1>

      {/* Account */}
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-gray-300">Account</h2>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Email</span>
          <span className="text-gray-200">{user?.email}</span>
        </div>
        <div className="pt-1 border-t border-gray-800">
          <button className="btn-ghost text-xs mt-2" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </div>

      {/* Subscription */}
      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-gray-300">Subscription</h2>

        {justSubscribed && (
          <div className="bg-green-900/50 border border-green-800 rounded-lg px-4 py-3 text-green-400 text-sm">
            Subscription activated — thanks for subscribing!
          </div>
        )}

        {error && (
          <div className="bg-red-900/50 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : !profile ? (
          <p className="text-sm text-gray-500">Could not load subscription status.</p>
        ) : (
          <SubscriptionPanel
            profile={profile}
            prices={prices}
            onSubscribe={subscribe}
            onPortal={openPortal}
            checkoutLoading={checkoutLoading}
            portalLoading={portalLoading}
          />
        )}
      </div>
    </div>
  )
}

function SubscriptionPanel({ profile, prices, onSubscribe, onPortal, checkoutLoading, portalLoading }) {
  const { access, trialDaysLeft, subscriptionEndsAt } = profile
  const showSubscribeButtons = access === 'trial' || access === 'expired' || access === 'grace'

  return (
    <div className="space-y-4">
      {/* Status row */}
      <div className="flex items-center gap-3">
        {access === 'active' && <span className="badge-viable">Active</span>}
        {access === 'trial' && <span className="badge-at-risk">Trial</span>}
        {access === 'grace' && <span className="badge-viable">Early Access</span>}
        {access === 'expired' && <span className="badge-critical">Expired</span>}

        <span className="text-sm text-gray-400">
          {access === 'grace' && 'Free early-access until 1 July 2026'}
          {access === 'trial' && `${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} remaining in your free trial`}
          {access === 'active' && subscriptionEndsAt &&
            `Renews ${new Date(subscriptionEndsAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}`}
          {access === 'expired' && 'Your trial has ended — subscribe to continue'}
        </span>
      </div>

      {/* Subscribe buttons */}
      {showSubscribeButtons && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            {access === 'grace'
              ? 'Lock in your subscription before early access ends.'
              : 'Subscribe to keep your scenarios and access all features.'}
          </p>
          <div className="flex gap-3 flex-wrap">
            <button
              className="btn-primary text-sm"
              disabled={!!checkoutLoading}
              onClick={() => onSubscribe(prices?.monthly, 'monthly')}
            >
              {checkoutLoading === 'monthly' ? 'Redirecting…' : 'Monthly — $12/mo'}
            </button>
            <button
              className="btn-primary text-sm"
              disabled={!!checkoutLoading}
              onClick={() => onSubscribe(prices?.annual, 'annual')}
            >
              {checkoutLoading === 'annual' ? 'Redirecting…' : 'Annually — $99/yr'}
            </button>
          </div>
          <p className="text-xs text-gray-600">Annual plan saves $45 vs monthly (31% off)</p>
        </div>
      )}

      {/* Manage billing — active subscribers */}
      {access === 'active' && (
        <button
          className="btn-ghost text-sm"
          disabled={portalLoading}
          onClick={onPortal}
        >
          {portalLoading ? 'Opening…' : 'Manage Billing'}
        </button>
      )}
    </div>
  )
}
