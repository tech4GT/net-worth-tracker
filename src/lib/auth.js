// Auth module — pure JS, no React dependency.
// Manages Cognito OAuth2 + PKCE flow with Google federated IdP.

const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID
const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI

// ---------------------------------------------------------------------------
// Dev mode bypass — when Cognito is not configured, auto-authenticate
// ---------------------------------------------------------------------------

export const DEV_MODE = !COGNITO_DOMAIN

const DEV_USER = { sub: 'dev-user-1', email: 'dev@localhost', name: 'Dev User' }

// ---------------------------------------------------------------------------
// Token storage (memory-only for access/id, sessionStorage for refresh)
// ---------------------------------------------------------------------------

let accessToken = null
let idToken = null
let parsedUser = null

const REFRESH_KEY = 'nwt-refresh'
const VERIFIER_KEY = 'nwt-pkce-verifier'

function getRefreshToken() {
  return sessionStorage.getItem(REFRESH_KEY)
}

function setRefreshToken(token) {
  if (token) {
    sessionStorage.setItem(REFRESH_KEY, token)
  }
}

function clearTokens() {
  accessToken = null
  idToken = null
  parsedUser = null
  sessionStorage.removeItem(REFRESH_KEY)
}

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

function base64UrlDecode(str) {
  // Replace URL-safe chars and pad
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad = base64.length % 4
  if (pad) base64 += '='.repeat(4 - pad)
  return atob(base64)
}

function parseJwtPayload(token) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = base64UrlDecode(parts[1])
    return JSON.parse(payload)
  } catch {
    return null
  }
}

function isTokenExpired(token, bufferSeconds = 0) {
  const payload = parseJwtPayload(token)
  if (!payload || !payload.exp) return true
  const now = Math.floor(Date.now() / 1000)
  return payload.exp - bufferSeconds <= now
}

function extractUser(idTokenStr) {
  const payload = parseJwtPayload(idTokenStr)
  if (!payload) return null
  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name || payload.email,
  }
}

// ---------------------------------------------------------------------------
// PKCE helpers (Web Crypto API)
// ---------------------------------------------------------------------------

function generateCodeVerifier() {
  const array = new Uint8Array(64)
  crypto.getRandomValues(array)
  // Base64url encode to get 86-character string (within 43-128 range)
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function deriveCodeChallenge(verifier) {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(digest)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// ---------------------------------------------------------------------------
// Auth state change listeners
// ---------------------------------------------------------------------------

const listeners = new Set()

function notifyListeners() {
  const authenticated = isAuthenticated()
  const user = getUser()
  for (const cb of listeners) {
    try {
      cb({ authenticated, user })
    } catch {
      // ignore listener errors
    }
  }
}

/**
 * Register a callback that fires when auth state changes.
 * Returns an unsubscribe function.
 */
export function onAuthChange(callback) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

// ---------------------------------------------------------------------------
// Refresh mutex — prevents concurrent refresh calls
// ---------------------------------------------------------------------------

let refreshPromise = null

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Redirect to Cognito Hosted UI for Google sign-in.
 */
export async function loginWithGoogle() {
  if (DEV_MODE) return DEV_USER
  const verifier = generateCodeVerifier()
  sessionStorage.setItem(VERIFIER_KEY, verifier)

  const challenge = await deriveCodeChallenge(verifier)

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: REDIRECT_URI,
    identity_provider: 'Google',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })

  window.location.href = `${COGNITO_DOMAIN}/oauth2/authorize?${params.toString()}`
}

/**
 * Exchange an authorization code for tokens.
 * Returns the parsed user info or throws on failure.
 */
export async function handleCallback(code) {
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  if (!verifier) {
    throw new Error('Missing PKCE code_verifier — cannot complete login.')
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  })

  const res = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token exchange failed: ${res.status} ${text}`)
  }

  const data = await res.json()

  // Clean up verifier — it is single-use
  sessionStorage.removeItem(VERIFIER_KEY)

  // Store tokens
  accessToken = data.access_token
  idToken = data.id_token
  if (data.refresh_token) {
    setRefreshToken(data.refresh_token)
  }

  parsedUser = extractUser(idToken)
  notifyListeners()
  return parsedUser
}

/**
 * Silently refresh tokens using the stored refresh token.
 * Returns true on success, false on failure.
 */
export async function refreshTokens() {
  const refresh = getRefreshToken()
  if (!refresh) return false

  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: refresh,
    })

    const res = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    if (!res.ok) {
      // Refresh token may be expired or revoked
      clearTokens()
      notifyListeners()
      return false
    }

    const data = await res.json()
    accessToken = data.access_token
    idToken = data.id_token
    // Cognito may or may not return a new refresh token
    if (data.refresh_token) {
      setRefreshToken(data.refresh_token)
    }
    parsedUser = extractUser(idToken)
    notifyListeners()
    return true
  } catch {
    // Network error — don't clear tokens, they might still be valid
    return false
  }
}

/**
 * Returns the current access token.
 * If it expires within 60 seconds, attempts a refresh first.
 * Uses a mutex to prevent concurrent refreshes.
 */
export async function getAccessToken() {
  if (DEV_MODE) return 'dev-token'
  // If token is still valid (more than 60s left), return immediately
  if (accessToken && !isTokenExpired(accessToken, 60)) {
    return accessToken
  }

  // Attempt refresh with mutex
  if (!refreshPromise) {
    refreshPromise = refreshTokens().finally(() => {
      refreshPromise = null
    })
  }
  await refreshPromise

  return accessToken
}

/**
 * Returns the parsed user info { sub, email, name } or null.
 */
export function getUser() {
  if (DEV_MODE) return DEV_USER
  if (parsedUser) return parsedUser
  if (idToken) {
    parsedUser = extractUser(idToken)
    return parsedUser
  }
  return null
}

/**
 * Returns true if the user is considered authenticated:
 * either the access token is still valid, or a refresh token exists.
 */
export function isAuthenticated() {
  if (DEV_MODE) return true
  if (accessToken && !isTokenExpired(accessToken)) return true
  if (getRefreshToken()) return true
  return false
}

/**
 * Clear all auth state and redirect to the Cognito logout endpoint.
 */
export function logout() {
  if (DEV_MODE) {
    window.location.reload()
    return
  }
  clearTokens()
  notifyListeners()

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    logout_uri: REDIRECT_URI,
  })

  window.location.href = `${COGNITO_DOMAIN}/logout?${params.toString()}`
}
