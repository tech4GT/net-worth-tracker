import { getAccessToken } from './auth.js'

const API_BASE = import.meta.env.VITE_API_URL || ''

async function request(method, path, body) {
  const token = await getAccessToken()
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    window.dispatchEvent(new Event('auth:expired'))
    throw new Error('Session expired')
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `API error: ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  delete: (path) => request('DELETE', path),
}
