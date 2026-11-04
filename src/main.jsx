import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { reportarError } from './comun.js'
import { SiFalla } from './ui.jsx'

// Lo que falle fuera de React (eventos, promesas sin atender) también llega al log del servidor
addEventListener('error', reportarError)
addEventListener('unhandledrejection', reportarError)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SiFalla>
      <App />
    </SiFalla>
  </StrictMode>,
)
