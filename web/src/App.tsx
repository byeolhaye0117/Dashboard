import { BrowserRouter, Route, Routes } from 'react-router'
import { AppStateProvider } from './app/state'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Members from './pages/Members'
import MemberDetail from './pages/MemberDetail'
import Register from './pages/Register'
import Retention from './pages/Retention'
import Consultations from './pages/Consultations'

export default function App() {
  return (
    <AppStateProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="members" element={<Members />} />
            <Route path="members/:id" element={<MemberDetail />} />
            <Route path="register" element={<Register />} />
            <Route path="retention" element={<Retention />} />
            <Route path="consultations" element={<Consultations />} />
            <Route path="*" element={<Dashboard />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppStateProvider>
  )
}
