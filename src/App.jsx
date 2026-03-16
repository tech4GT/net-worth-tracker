import { BrowserRouter, Routes, Route } from 'react-router-dom'
import useTheme from './hooks/useTheme'
import AppShell from './components/layout/AppShell'
import DashboardPage from './pages/DashboardPage'
import AssetsPage from './pages/AssetsPage'
import LiabilitiesPage from './pages/LiabilitiesPage'
import HistoryPage from './pages/HistoryPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  useTheme()

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/assets" element={<AssetsPage />} />
          <Route path="/liabilities" element={<LiabilitiesPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
