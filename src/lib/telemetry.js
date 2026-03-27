const FLUSH_INTERVAL_MS = 30000
const MAX_QUEUE_SIZE = 50
const ENDPOINT = `${import.meta.env.VITE_API_URL || ''}/api/telemetry`

// Module state (not exported)
let queue = []
let sessionId = null
let flushTimer = null

function getSessionId() {
  if (sessionId) return sessionId
  sessionId = sessionStorage.getItem('nwt-sid')
  if (!sessionId) {
    sessionId = crypto.randomUUID()
    sessionStorage.setItem('nwt-sid', sessionId)
  }
  return sessionId
}

function getDeviceInfo() {
  const width = window.innerWidth
  let deviceType = 'desktop'
  if (width < 768) deviceType = 'mobile'
  else if (width < 1024) deviceType = 'tablet'
  return {
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    deviceType,
  }
}

export function track(eventName, props = {}) {
  if (import.meta.env.DEV) {
    console.debug('[telemetry]', eventName, props)
    return
  }
  queue.push({
    event: eventName,
    page: window.location.hash.replace('#', '') || '/',
    props: { ...getDeviceInfo(), ...props },
    ts: Date.now(),
    sid: getSessionId(),
  })
  if (queue.length >= MAX_QUEUE_SIZE) {
    flush()
  }
}

export function flush() {
  if (queue.length === 0) return
  const batch = queue.splice(0, MAX_QUEUE_SIZE)
  const body = JSON.stringify({ events: batch })
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, body)
    } else {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {})
    }
  } catch {
    // Telemetry must never break the app
  }
}

export function initTelemetry() {
  flushTimer = setInterval(flush, FLUSH_INTERVAL_MS)

  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })

  track('session_start')

  window.addEventListener('error', (e) => {
    track('error', {
      errorMessage: e.message,
      errorStack: e.error?.stack?.slice(0, 500),
    })
  })

  window.addEventListener('unhandledrejection', (e) => {
    track('error', {
      errorMessage: String(e.reason).slice(0, 500),
    })
  })
}
