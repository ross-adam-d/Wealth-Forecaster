import { useState, useEffect } from 'react'

/**
 * Manages light/dark theme preference.
 * Persists to localStorage and applies/removes the 'light' class on <html>.
 * Default: dark (no class on <html>).
 */
export function useTheme() {
  const [isLight, setIsLight] = useState(() => {
    try {
      return localStorage.getItem('theme') === 'light'
    } catch {
      return false
    }
  })

  useEffect(() => {
    const html = document.documentElement
    if (isLight) {
      html.classList.add('light')
    } else {
      html.classList.remove('light')
    }
    try {
      localStorage.setItem('theme', isLight ? 'light' : 'dark')
    } catch {}
  }, [isLight])

  const toggleTheme = () => setIsLight(v => !v)

  return { isLight, toggleTheme }
}
