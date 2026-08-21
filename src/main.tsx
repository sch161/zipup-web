import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { registerSessionCleanup } from './lib/sessionCleanup'

// 로그인한 사람이 바뀌면 앞사람이 남긴 분석 결과/상담 내용을 sessionStorage에서 지운다.
// 앱 전체에서 한 번만 등록하면 되므로 렌더링 전에 여기서 처리한다.
registerSessionCleanup()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
