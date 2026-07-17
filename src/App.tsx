import { Navigate, Route, Routes } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Home from './pages/Home'
import Analysis from './pages/Analysis'
import Placeholder from './pages/Placeholder'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/analysis" element={<Analysis />} />

      <Route element={<MainLayout />}>
        <Route path="/home" element={<Home />} />
        <Route
          path="/psych-guard"
          element={
            <Placeholder title="🛡️ 심리 가드" emoji="🛡️" description="가스라이팅 탐지 기능은 준비 중이에요." />
          }
        />
        <Route
          path="/map"
          element={<Placeholder title="안심 시그널 맵" emoji="🗺️" description="지역별 위험도 지도는 준비 중이에요." />}
        />
        <Route
          path="/profile"
          element={<Placeholder title="프로필" emoji="👤" description="프로필 화면은 준비 중이에요." />}
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
