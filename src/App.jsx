import { BrowserRouter, Routes, Route } from 'react-router-dom'
import useTheme from './hooks/useTheme'
import AppShell from './components/layout/AppShell'
import DashboardPage from './pages/DashboardPage'
import AssetsPage from './pages/AssetsPage'
import LiabilitiesPage from './pages/LiabilitiesPage'
import HistoryPage from './pages/HistoryPage'
import SettingsPage from './pages/SettingsPage'
import ErrorBoundary from './components/ui/ErrorBoundary'

export default function App() {
  useTheme()

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<ErrorBoundary><DashboardPage /></ErrorBoundary>} />
          <Route path="/assets" element={<ErrorBoundary><AssetsPage /></ErrorBoundary>} />
          <Route path="/liabilities" element={<ErrorBoundary><LiabilitiesPage /></ErrorBoundary>} />
          <Route path="/history" element={<ErrorBoundary><HistoryPage /></ErrorBoundary>} />
          <Route path="/settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
