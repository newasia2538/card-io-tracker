import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const serviceWorkerUrl = new URL('/sw.js', window.location.origin)

  if (serviceWorkerUrl.origin === window.location.origin) {
    window.addEventListener('load', () => {
      void navigator.serviceWorker.register(serviceWorkerUrl)
    })
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
