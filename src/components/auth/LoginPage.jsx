import { useAuth } from '../../contexts/AuthContext'

export default function LoginPage() {
  const { login, loading } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-600 via-primary-700 to-indigo-800" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="relative max-w-5xl mx-auto px-6 pt-16 pb-24 sm:pt-24 sm:pb-32">
          {/* Nav bar */}
          <div className="flex items-center justify-between mb-16 sm:mb-24">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <span className="text-white font-semibold text-lg">Net Worth Tracker</span>
            </div>
            <button
              onClick={login}
              disabled={loading}
              className="hidden sm:inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-white text-primary-700 hover:bg-gray-100 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {loading ? <Spinner className="w-4 h-4" /> : 'Sign in'}
            </button>
          </div>

          {/* Hero content */}
          <div className="max-w-2xl">
            <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight tracking-tight">
              Know your net worth.
              <br />
              <span className="text-white/80">Grow your net worth.</span>
            </h1>
            <p className="mt-6 text-lg text-white/70 leading-relaxed max-w-lg">
              Track assets, liabilities, and investments in one place. Get live stock prices, multi-currency support, and monthly snapshots to see your financial growth over time.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <button
                onClick={login}
                disabled={loading}
                className="inline-flex items-center justify-center gap-3 rounded-xl px-6 py-3.5 text-base font-semibold bg-white text-primary-700 hover:bg-gray-100 active:bg-gray-200 transition-colors shadow-lg shadow-black/10 disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <Spinner className="w-5 h-5" />
                ) : (
                  <>
                    <GoogleIcon className="w-5 h-5" />
                    Get started with Google
                  </>
                )}
              </button>
              <a
                href="#features"
                className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-medium text-white/90 border border-white/20 hover:bg-white/10 transition-colors cursor-pointer"
              >
                Learn more
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div id="features" className="max-w-5xl mx-auto px-6 py-20 sm:py-28">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            Everything you need to track your wealth
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
            A simple, powerful tool built for people who want clarity on their finances without the complexity of traditional financial software.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          <FeatureCard
            icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />}
            title="Multi-Currency"
            description="Track assets in any currency. Live exchange rates convert everything to your base currency automatically."
          />
          <FeatureCard
            icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />}
            title="Live Stock Prices"
            description="Add your stock portfolio and get real-time prices from Yahoo Finance. Refresh with one click."
          />
          <FeatureCard
            icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />}
            title="Monthly Snapshots"
            description="Take monthly snapshots to track your net worth growth over time. See trends and milestones."
          />
          <FeatureCard
            icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />}
            title="Visual Dashboard"
            description="See your complete financial picture at a glance with charts showing asset allocation and net worth trends."
          />
          <FeatureCard
            icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />}
            title="Secure & Private"
            description="Sign in with Google. Your data is encrypted and stored securely. Only you can access your financial data."
          />
          <FeatureCard
            icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />}
            title="Import & Export"
            description="Import your existing data via CSV or JSON. Export anytime. Your data is always yours."
          />
        </div>
      </div>

      {/* CTA */}
      <div className="max-w-5xl mx-auto px-6 pb-20 sm:pb-28">
        <div className="relative rounded-3xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary-600 to-indigo-700" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(255,255,255,0.1),transparent_60%)]" />
          <div className="relative px-8 py-14 sm:px-16 sm:py-20 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">
              Start tracking your net worth today
            </h2>
            <p className="mt-4 text-white/70 max-w-md mx-auto">
              Free to use. No credit card required. Takes less than a minute to get started.
            </p>
            <button
              onClick={login}
              disabled={loading}
              className="mt-8 inline-flex items-center justify-center gap-3 rounded-xl px-8 py-3.5 text-base font-semibold bg-white text-primary-700 hover:bg-gray-100 transition-colors shadow-lg shadow-black/10 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <Spinner className="w-5 h-5" />
              ) : (
                <>
                  <GoogleIcon className="w-5 h-5" />
                  Sign in with Google
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 dark:border-gray-800">
        <div className="max-w-5xl mx-auto px-6 py-8 flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
          <span>Net Worth Tracker</span>
          <span>Your data is securely stored in the cloud.</span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Feature card component
// ---------------------------------------------------------------------------

function FeatureCard({ icon, title, description }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
      <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center mb-4">
        <svg className="w-5 h-5 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {icon}
        </svg>
      </div>
      <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{description}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------

function GoogleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

function Spinner({ className }) {
  return (
    <svg
      className={`animate-spin ${className}`}
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
  )
}
