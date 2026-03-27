import { useState, useRef, useEffect } from 'react'
import ThemeToggle from '../ui/ThemeToggle'
import { useAuth } from '../../contexts/AuthContext'

export default function Header({ title, onMenuClick }) {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  const displayName = user?.name || user?.email || 'User'
  const initial = displayName.charAt(0).toUpperCase()

  return (
    <header className="sticky top-0 z-30 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between px-4 lg:px-8 h-16">
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            className="lg:hidden text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            {title}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {user && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((prev) => !prev)}
                className="flex items-center gap-2 cursor-pointer rounded-lg px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <span className="hidden sm:block text-sm text-gray-700 dark:text-gray-300 truncate max-w-[140px]">
                  {displayName}
                </span>
                {user?.picture ? (
                  <img
                    src={user.picture}
                    alt={displayName}
                    className="w-8 h-8 rounded-full shrink-0 object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="w-8 h-8 rounded-full bg-primary-600 text-white flex items-center justify-center text-sm font-medium shrink-0">
                    {initial}
                  </span>
                )}
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-40">
                  <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {displayName}
                    </p>
                    {user?.email && user.email !== displayName && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {user.email}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      logout()
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
