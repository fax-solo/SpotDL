import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { registerServiceWorker } from './serviceWorker'

registerServiceWorker()

const root = document.getElementById('root')!

if (root.hasChildNodes()) {
  createRoot(root).render(<StrictMode><App /></StrictMode>)
} else {
  const observer = new MutationObserver(() => {
    if (root.hasChildNodes()) {
      observer.disconnect()
      createRoot(root).render(<StrictMode><App /></StrictMode>)
    }
  })
  observer.observe(root, { childList: true })
  createRoot(root).render(<StrictMode><App /></StrictMode>)
}
