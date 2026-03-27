import { useState, useEffect } from 'react'

// Module-level toast state
let listeners = new Set()
let toasts = []
let nextId = 0

function notify() {
  listeners.forEach((fn) => fn([...toasts]))
}

export function toast(message, type = 'info') {
  const id = nextId++
  const t = { id, message, type, createdAt: Date.now() }
  toasts = [...toasts, t]
  notify()
  setTimeout(() => dismissToast(id), 4000)
  return id
}

export function dismissToast(id) {
  toasts = toasts.filter((t) => t.id !== id)
  notify()
}

export function toastSuccess(message) {
  return toast(message, 'success')
}

export function toastError(message) {
  return toast(message, 'error')
}

function useToasts() {
  const [current, setCurrent] = useState(toasts)
  useEffect(() => {
    listeners.add(setCurrent)
    return () => listeners.delete(setCurrent)
  }, [])
  return current
}

const icons = {
  success: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"
      />
    </svg>
  ),
  info: (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"
      />
    </svg>
  ),
}

const typeStyles = {
  success: 'bg-success-500 text-white',
  error: 'bg-danger-500 text-white',
  info: 'bg-primary-600 text-white',
}

export function ToastContainer() {
  const items = useToasts()

  if (items.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
      {items.map((t) => (
        <div
          key={t.id}
          className={`${typeStyles[t.type] || typeStyles.info} max-w-sm rounded-lg shadow-lg p-4 flex items-start gap-3 pointer-events-auto cursor-pointer animate-[slideIn_0.2s_ease-out]`}
          onClick={() => dismissToast(t.id)}
          role="alert"
        >
          {icons[t.type] || icons.info}
          <p className="text-sm font-medium leading-5">{t.message}</p>
          <button
            onClick={(e) => {
              e.stopPropagation()
              dismissToast(t.id)
            }}
            className="ml-auto shrink-0 text-white/80 hover:text-white transition-colors cursor-pointer"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
