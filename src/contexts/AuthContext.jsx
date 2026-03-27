import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
  loginWithGoogle,
  handleCallback,
  refreshTokens,
  getUser,
  isAuthenticated,
  logout as authLogout,
  onAuthChange,
  DEV_MODE,
} from '../lib/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const login = useCallback(() => loginWithGoogle(), [])

  const logout = useCallback(() => authLogout(), [])

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        // Dev mode — skip OAuth, auto-authenticate
        if (DEV_MODE) {
          if (!cancelled) setUser(getUser())
          return
        }

        // Check for OAuth callback code in the top-level query string.
        // With HashRouter the redirect comes back as e.g.
        //   http://localhost:5173/?code=abc123#/
        // so we read from window.location.search.
        const params = new URLSearchParams(window.location.search)
        const code = params.get('code')

        if (code) {
          // Exchange code for tokens
          const userInfo = await handleCallback(code)
          if (!cancelled) setUser(userInfo)

          // Clean the code from the URL so a page refresh won't retry
          const url = new URL(window.location.href)
          url.searchParams.delete('code')
          window.history.replaceState({}, '', url.pathname + url.hash)
        } else if (isAuthenticated()) {
          // No code, but we may have a refresh token — try silent refresh
          const ok = await refreshTokens()
          if (!cancelled) {
            setUser(ok ? getUser() : null)
          }
        }
      } catch {
        // Token exchange or refresh failed — stay unauthenticated
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    init()
    return () => { cancelled = true }
  }, [])

  // Keep React state in sync with auth module changes
  useEffect(() => {
    const unsub = onAuthChange(({ user: u }) => {
      setUser(u)
    })
    return unsub
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (ctx === null) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
