import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import useStore from '../../store/store'
import { track } from '../../lib/telemetry'
import { ToastContainer } from '../ui/Toast'

const pageTitles = {
  '/': 'Dashboard',
  '/assets': 'Assets',
  '/liabilities': 'Liabilities',
  '/history': 'History',
  '/settings': 'Settings',
}

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const title = pageTitles[location.pathname] || 'Net Worth Tracker'

  const loading = useStore((s) => s.loading)
  const error = useStore((s) => s.error)
  const hydrated = useStore((s) => s.hydrated)
  const loadUserData = useStore((s) => s.loadUserData)

  // Load user data on mount if not yet hydrated
  useEffect(() => {
    if (!hydrated) {
      loadUserData()
    }
  }, [hydrated, loadUserData])

  // Track page views
  useEffect(() => {
    track('page_view')
  }, [location.pathname])

  const renderContent = () => {
    if (loading && !hydrated) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <svg
            className="w-8 h-8 text-primary-600 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Loading your data...
          </p>
        </div>
      )
    }

    if (error) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="text-center">
            <p className="text-sm text-danger-500 mb-3">{error}</p>
            <button
              onClick={() => loadUserData()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        </div>
      )
    }

    return (
      <main className="p-4 lg:p-8 flex-1">
        <Outlet />
      </main>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="lg:pl-64 flex flex-col flex-1">
        <Header
          title={title}
          onMenuClick={() => setSidebarOpen(true)}
        />
        {renderContent()}
      </div>
      <ToastContainer />
    </div>
  )
}
