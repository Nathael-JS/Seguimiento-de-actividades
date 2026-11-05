import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fuentes dentro de la app (sin Google Fonts): funciona sin salida a internet. Solo el subconjunto latino (español e inglés)
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import '@fontsource/ibm-plex-mono/latin-600.css'
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
