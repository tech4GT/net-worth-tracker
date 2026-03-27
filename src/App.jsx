import { HashRouter, Routes, Route } from 'react-router-dom'
import useTheme from './hooks/useTheme'
import { AuthProvider } from './contexts/AuthContext'
import LoginPage from './components/auth/LoginPage'
import ProtectedRoute from './components/auth/ProtectedRoute'
import AppShell from './components/layout/AppShell'
import DashboardPage from './pages/DashboardPage'
import AssetsPage from './pages/AssetsPage'
import LiabilitiesPage from './pages/LiabilitiesPage'
import HistoryPage from './pages/HistoryPage'
import SettingsPage from './pages/SettingsPage'
import BudgetPage from './pages/BudgetPage'

export default function App() {
  useTheme()

  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/assets" element={<AssetsPage />} />
            <Route path="/liabilities" element={<LiabilitiesPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/budget" element={<BudgetPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}
