import { useState } from 'react'
import { api, iniciales, passwordValida } from './comun.js'
import { Campo, PasswordNueva } from './ui.jsx'

// Paso 1: validar número de empleado y correo. Paso 2: contraseña nueva
export default function Recuperar({ volver }) {
  const [no, setNo] = useState('')
  const [email, setEmail] = useState('')
  const [permiso, setPermiso] = useState(null)
  const [p, setP] = useState(['', ''])
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(accion) {
    setError('')
    setEnviando(true)
    try {
      await accion()
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  function validar(e) {
    e.preventDefault()
    if (!no.trim() || !email.trim()) return setError('Escribe tu número de empleado y tu correo.')
    enviar(async () => setPermiso(await api('/api/recuperar', { method: 'POST', body: { no: no.trim(), email } })))
  }

  function guardar(e) {
    e.preventDefault()
    if (!passwordValida(...p)) return setError('La contraseña no cumple los requisitos.')
    enviar(async () => {
      await api('/api/recuperar/cambiar', { method: 'POST', body: { token: permiso.token, password: p[0] } })
      volver('Contraseña actualizada. Inicia sesión con la nueva.')
    })
  }

  if (!permiso) {
    return (
      <form className="auth-form" onSubmit={validar} noValidate>
        <h1>Recuperar cuenta</h1>
        <p className="lead">Valida tus datos para cambiar tu contraseña.</p>
        <Campo label="Número de empleado" id="no" inputMode="numeric" placeholder="10482" value={no} onChange={(e) => setNo(e.target.value)} />
        <Campo label="Correo registrado" id="email" type="email" placeholder="jorge.salinas@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <p className="error" role="alert">{error}</p>
        <button className="btn btn-primary btn-block" type="submit" disabled={enviando}>Validar datos</button>
        <button type="button" className="btn btn-ghost" onClick={() => volver()}>← Volver</button>
      </form>
    )
  }

  return (
    <form className="auth-form" onSubmit={guardar} noValidate>
      <h1>Nueva contraseña</h1>
      <div className="emp-chip">
        <span className="avatar">{iniciales(permiso.name)}</span>
        <div><b>{permiso.name}</b><div className="muted mono" style={{ fontSize: 13 }}>{permiso.no} · {permiso.email}</div></div>
      </div>
      <PasswordNueva p1={p[0]} p2={p[1]} onChange={(a, b) => { setP([a, b]); setError('') }} />
      <p className="error" role="alert">{error}</p>
      <button className="btn btn-primary btn-block" type="submit" disabled={enviando}>Guardar contraseña</button>
      <button type="button" className="btn btn-ghost" onClick={() => volver()}>← Volver</button>
    </form>
  )
}
