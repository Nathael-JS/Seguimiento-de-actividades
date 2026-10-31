import { useState } from 'react'
import Login from './Login.jsx'
import Shell from './Shell.jsx'
import { useIdioma } from './i18n.js'

export default function App() {
  // shortcut: la sesión vive solo en memoria, se pierde al recargar; usar token/cookie al agregar seguridad
  const [user, setUser] = useState(null)
  useIdioma()
  return user ? <Shell user={user} onLogout={() => setUser(null)} /> : <Login onLogin={setUser} />
}
