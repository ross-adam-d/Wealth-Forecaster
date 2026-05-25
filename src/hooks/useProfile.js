import { useState, useEffect, useCallback } from 'react'

const API = 'https://www.wealthspan.au/api'

export function useProfile(user) {
  const [profile, setProfile] = useState(null)
  const [prices, setPrices] = useState(null)
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState(null)

  const fetchProfile = useCallback(async () => {
    if (!user?.id) return
    try {
      const [profileData, pricesData] = await Promise.all([
        fetch(`${API}/profile?userId=${user.id}`).then(r => r.json()),
        fetch(`${API}/prices`).then(r => r.json()),
      ])
      setProfile(profileData)
      setPrices(pricesData)
    } catch {
      // network failure — don't block the app
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    // If returning from Stripe checkout, wait for webhook to update the profile
    const justSubscribed = window.location.search.includes('subscribed=true')
    if (justSubscribed) {
      const t = setTimeout(fetchProfile, 2500)
      return () => clearTimeout(t)
    }
    fetchProfile()
  }, [fetchProfile, user?.id])

  async function subscribe(priceId, plan) {
    if (!priceId || !user) return
    setCheckoutLoading(plan)
    try {
      const res = await fetch(`${API}/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, userId: user.id, email: user.email }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      window.location.href = data.url
    } catch {
      setCheckoutLoading(null)
    }
  }

  return { profile, prices, loading, checkoutLoading, subscribe }
}
