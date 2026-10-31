import { useState } from 'react'
import { api } from './comun.js'
import Icono from './Icono.jsx'
import Recuperar from './Recuperar.jsx'
import Registro from './Registro.jsx'
import { Campo } from './ui.jsx'

// Pantallas de acceso: 'login' → 'codigo' (2 pasos), o 'registro' / 'recuperar' que vuelven al login
export default function Login({ onLogin }) {
  const [pantalla, setPantalla] = useState('login')
  const [verificacion, setVerificacion] = useState(null)
  const [aviso, setAviso] = useState('')

  const volver = (mensaje = '') => {
    setAviso(mensaje)
    setPantalla('login')
  }

  return (
    <div className="auth">
      <aside className="auth-art">
        <div className="brandname"><i />Seguimiento de Actividades</div>
        <svg className="motif" viewBox="0 0 420 420" aria-hidden="true">
          <g fill="none" strokeLinecap="round" strokeWidth="16">
            <path d="M210 40 A170 170 0 1 1 40 210" stroke="var(--brand)" />
            <path d="M210 90 A120 120 0 0 1 210 330" stroke="var(--accent)" />
            <path d="M210 140 A70 70 0 0 1 280 210" stroke="var(--brand-soft)" />
          </g>
        </svg>
        <div className="auth-copy">
          <h2>Cada turno, a la vista.</h2>
          <p>Asigna, ejecuta y supervisa las actividades de cada turno en un solo lugar.</p>
        </div>
      </aside>
      <main className="auth-main">
        {pantalla === 'login' && (
          <Credenciales aviso={aviso} ir={setPantalla}
            onPaso1={(v) => { setVerificacion(v); setAviso(''); setPantalla('codigo') }} />
        )}
        {pantalla === 'codigo' && <Codigo verificacion={verificacion} onLogin={onLogin} volver={volver} />}
        {pantalla === 'registro' && <Registro volver={volver} />}
        {pantalla === 'recuperar' && <Recuperar volver={volver} />}
      </main>
    </div>
  )
}

function Credenciales({ aviso, ir, onPaso1 }) {
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    const usuario = e.target.usuario.value.trim()
    const password = e.target.password.value
    const errs = {
      ...(!usuario && { usuario: 'Escribe tu usuario o correo.' }),
      ...(!password && { password: 'Escribe tu contraseña.' }),
    }
    setErrors(errs)
    setError('')
    if (Object.keys(errs).length) return

    setLoading(true)
    try {
      onPaso1(await api('/api/login', { method: 'POST', body: { usuario, password } }))
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <h1>Iniciar sesión</h1>
      <p className="lead">Ingresa con tu usuario, correo o número de empleado.</p>
      {aviso && <div className="notice" role="status"><Icono nombre="check" /><span>{aviso}</span></div>}
      <Campo name="usuario" id="usuario" label="Usuario o correo electrónico" error={errors.usuario} autoComplete="username" placeholder="jorge.salinas@empresa.com" />
      <Campo name="password" id="password" label="Contraseña" error={errors.password} type="password" autoComplete="current-password" />
      <button type="button" className="link" onClick={() => ir('recuperar')}>¿Olvidaste tu contraseña?</button>
      <p className="error" role="alert">{error}</p>
      <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
        {loading ? 'Ingresando…' : 'Ingresar'}
      </button>
      <p className="muted" style={{ textAlign: 'center' }}>
        ¿No tienes cuenta? <button type="button" className="link" onClick={() => ir('registro')}>Registrarse</button>
      </p>
    </form>
  )
}

function Codigo({ verificacion, onLogin, volver }) {
  const [codigo, setCodigo] = useState('')
  const [simulado, setSimulado] = useState(verificacion.codigo)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function verificar(e) {
    e.preventDefault()
    if (!/^\d{6}$/.test(codigo)) return setError('El código debe tener 6 dígitos.')
    setError('')
    setEnviando(true)
    try {
      onLogin(await api('/api/login/verificar', { method: 'POST', body: { token: verificacion.token, codigo } }))
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }

  async function reenviar() {
    setError('')
    try {
      setSimulado((await api('/api/login/reenviar', { method: 'POST', body: { token: verificacion.token } })).codigo)
      setCodigo('')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <form className="auth-form" onSubmit={verificar} noValidate>
      <span className="avatar" style={{ width: 48, height: 48 }}><Icono nombre="shield" /></span>
      <h1>Verificación en dos pasos</h1>
      <p className="lead">Escribe el código de 6 dígitos que enviamos a <b>{verificacion.destino}</b></p>
      {/* shortcut: código visible porque el envío por correo está simulado; quitar al conectar el servicio de email */}
      <div className="notice warn" role="status">
        <Icono nombre="alert" />
        <span>Modo de prueba: el correo es simulado. Tu código es <b className="mono">{simulado}</b></span>
      </div>
      <Campo label="Código de verificación" id="codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
        className="codigo" value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} autoFocus />
      <p className="error" role="alert">{error}</p>
      <button className="btn btn-primary btn-block" type="submit" disabled={enviando}>{enviando ? 'Verificando…' : 'Verificar'}</button>
      <div className="row between">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => volver()}>← Volver</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={reenviar}>Reenviar código</button>
      </div>
    </form>
  )
}
