import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { registerServiceWorker } from './serviceWorker'

registerServiceWorker()

const root = document.getElementById('root')!
createRoot(root).render(
  import.meta.env.PROD ? <App /> : <StrictMode><App /></StrictMode>,
)
