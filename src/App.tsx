import { Navigate, Route, Routes } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Home from './pages/Home'
import Analysis from './pages/Analysis'
import Cure from './pages/Cure'
import GaslightingDetail from './pages/GaslightingDetail'
import Privacy from './pages/Privacy'
import Profile from './pages/Profile'
import SignalMap from './pages/SignalMap'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/analysis" element={<Analysis />} />
      <Route path="/psych-guard/:id" element={<GaslightingDetail />} />
      <Route path="/privacy" element={<Privacy />} />

      <Route element={<MainLayout />}>
        <Route path="/home" element={<Home />} />
        <Route path="/psych-guard" element={<Cure />} />
        <Route path="/map" element={<SignalMap />} />
        <Route path="/profile" element={<Profile />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
