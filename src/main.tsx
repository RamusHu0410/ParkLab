import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { useParkStore } from './store/parkStore'
import './index.css'

if (import.meta.env.DEV) {
  // Exposed for console debugging: window.parkStore.getState()
  ;(window as unknown as { parkStore: typeof useParkStore }).parkStore = useParkStore
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
