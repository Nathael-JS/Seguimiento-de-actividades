import { useEffect, useState } from 'react'
import Login from './Login.jsx'
import Shell from './Shell.jsx'
import { t, useIdioma } from './i18n.js'

export default function App() {
  // undefined: todavía preguntando al servidor si hay sesión (no se muestra nada para no parpadear el login)
  const [user, setUser] = useState()
  const [aviso, setAviso] = useState('')
  const idioma = useIdioma()
  // El título de la pestaña también cambia de idioma (index.html trae el de español)
  useEffect(() => { document.title = t('Seguimiento de Actividades') }, [idioma])

  useEffect(() => {
    // Al recargar, la cookie de sesión dice quién es. fetch directo: sin sesión aquí no es "sesión terminada"
    fetch('/api/sesion').then((r) => (r.ok ? r.json() : null)).catch(() => null).then(setUser)
    // api() avisa cuando el servidor ya no reconoce la sesión (venció, o se cambió la contraseña en otro equipo)
    const terminada = () => { setAviso(t('Tu sesión terminó. Vuelve a iniciar sesión.')); setUser(null) }
    addEventListener('sesion-terminada', terminada)
    return () => removeEventListener('sesion-terminada', terminada)
  }, [])

  if (user === undefined) return null
  return user
    ? <Shell user={user} onLogout={() => setUser(null)} />
    : <Login aviso={aviso} onLogin={(u) => { setAviso(''); setUser(u) }} />
}
