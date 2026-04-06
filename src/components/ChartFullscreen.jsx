import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * Wraps a chart with a fullscreen expand button.
 * children is a render prop: (isFullscreen: boolean) => ReactNode
 *
 * In fullscreen the overlay fills the viewport and attempts to lock
 * the screen to landscape orientation (progressive enhancement — silently
 * ignored on browsers that don't support screen.orientation.lock).
 */
export default function ChartFullscreen({ title, children }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    screen.orientation?.lock?.('landscape').catch(() => {})
    return () => {
      document.body.style.overflow = ''
      screen.orientation?.unlock?.()
    }
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  return (
    <>
      <div className="relative">
        {/* Expand button — sits in top-right corner of chart area */}
        <button
          onClick={() => setOpen(true)}
          className="absolute top-0 right-0 z-10 p-1 rounded text-gray-600 hover:text-gray-300 transition-colors"
          title="Expand chart"
          aria-label="Expand chart to fullscreen"
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M9.5 1.5H13.5V5.5" />
            <path d="M5.5 13.5H1.5V9.5" />
            <path d="M13.5 1.5L9 6" />
            <path d="M1.5 13.5L6 9" />
          </svg>
        </button>
        {children(false)}
      </div>

      {open && createPortal(
        <div className="fixed inset-0 z-[200] bg-gray-950 flex flex-col" style={{ padding: '12px' }}>
          {/* Fullscreen header */}
          <div className="flex items-center justify-between mb-3 flex-shrink-0">
            <span className="text-sm font-semibold text-gray-200">{title}</span>
            <button
              onClick={() => setOpen(false)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="1.5" y1="1.5" x2="9.5" y2="9.5"/>
                <line x1="9.5" y1="1.5" x2="1.5" y2="9.5"/>
              </svg>
              Close
            </button>
          </div>
          {/* Chart fills remaining space */}
          <div className="flex-1 min-h-0">
            {children(true)}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
