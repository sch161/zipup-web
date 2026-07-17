import { Outlet } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import TopNav from '../components/TopNav'

export default function MainLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <TopNav variant="app" />
      <div className="mx-auto flex w-full max-w-app flex-1 flex-col pb-4 lg:max-w-[960px] lg:px-6 lg:pb-16 lg:pt-8">
        <Outlet />
      </div>
      <BottomNav />
    </div>
  )
}
