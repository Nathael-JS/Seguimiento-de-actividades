import { useEffect, useState } from 'react'
import Login from './Login.jsx'
import CambioObligatorio from './CambioObligatorio.jsx'
import Shell from './Shell.jsx'
import { t, useIdioma } from './i18n.js'
import { registrarDeptos } from './comun.js'

export default function App() {
  // undefined: todavía preguntando al servidor si hay sesión (no se muestra nada para no parpadear el login)
  const [user, setUser] = useState()
  const [aviso, setAviso] = useState('')
  const idioma = useIdioma()
  // El título de la pestaña también cambia de idioma (index.html trae el de español)
  useEffect(() => { document.title = t('Seguimiento de Actividades') }, [idioma])

  useEffect(() => {
    // Al recargar, la cookie de sesión dice quién es. fetch directo: sin sesión aquí no es "sesión terminada"
    const json = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    // Los nombres de los departamentos creados por gerentes, antes de pintar cualquier pantalla
    Promise.all([json('/api/sesion'), json('/api/deptos')]).then(([u, deptos]) => { registrarDeptos(deptos ?? []); setUser(u) })
    // api() avisa cuando el servidor ya no reconoce la sesión (venció, o se cambió la contraseña en otro equipo)
    const terminada = () => { setAviso(t('Tu sesión terminó. Vuelve a iniciar sesión.')); setUser(null) }
    addEventListener('sesion-terminada', terminada)
    return () => removeEventListener('sesion-terminada', terminada)
  }, [])

  if (user === undefined) return null
  if (user?.debeCambiar) {
    const salir = () => fetch('/api/logout', { method: 'POST' }).catch(() => {}).then(() => setUser(null))
    return <CambioObligatorio user={user} onListo={() => setUser({ ...user, debeCambiar: false })} onSalir={salir} />
  }
  return user
    ? <Shell user={user} onLogout={() => setUser(null)} />
    : <Login aviso={aviso} onLogin={(u) => { setAviso(''); setUser(u) }} />
}
