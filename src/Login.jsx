import { useState } from 'react'
import { api, rol } from './comun.js'
import Icono from './Icono.jsx'
import Recuperar from './Recuperar.jsx'
import Registro from './Registro.jsx'
import { BotonIdioma, BotonTema, Campo } from './ui.jsx'
import { t } from './i18n.js'

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
        <div className="brandname"><i />{t('Seguimiento de Actividades')}</div>
        <svg className="motif" viewBox="0 0 420 420" aria-hidden="true">
          <g fill="none" strokeLinecap="round" strokeWidth="16">
            <path d="M210 40 A170 170 0 1 1 40 210" stroke="var(--brand)" />
            <path d="M210 90 A120 120 0 0 1 210 330" stroke="var(--accent)" />
            <path d="M210 140 A70 70 0 0 1 280 210" stroke="var(--brand-soft)" />
          </g>
        </svg>
        <div className="auth-copy">
          <h2>{t('Cada turno, a la vista.')}</h2>
          <p>{t('Asigna, ejecuta y supervisa las actividades de cada turno en un solo lugar.')}</p>
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-top"><BotonIdioma /><BotonTema /></div>
        {pantalla === 'login' && (
          <Credenciales aviso={aviso} ir={setPantalla} onLogin={onLogin}
            onPaso1={(v) => { setVerificacion(v); setAviso(''); setPantalla('codigo') }} />
        )}
        {pantalla === 'codigo' && <Codigo verificacion={verificacion} onLogin={onLogin} volver={volver} />}
        {pantalla === 'registro' && <Registro volver={volver} />}
        {pantalla === 'recuperar' && <Recuperar volver={volver} />}
      </main>
    </div>
  )
}

// Cuentas de prueba para mostrar la app sin escribir credenciales ni código
const DEMOS = [['gte', 'Laura', '10001'], ['tec', 'Jorge', '10482']]

function Credenciales({ aviso, ir, onPaso1, onLogin }) {
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    const usuario = e.target.usuario.value.trim()
    const password = e.target.password.value
    const errs = {
      ...(!usuario && { usuario: t('Escribe tu usuario o correo.') }),
      ...(!password && { password: t('Escribe tu contraseña.') }),
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

  // shortcut: entra con la contraseña de prueba y el código simulado; quitar cuando haya usuarios reales
  async function demo(usuario) {
    setError('')
    setLoading(true)
    try {
      const { token, codigo } = await api('/api/login', { method: 'POST', body: { usuario, password: 'demo1234' } })
      onLogin(await api('/api/login/verificar', { method: 'POST', body: { token, codigo } }))
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <h1>{t('Iniciar sesión')}</h1>
      <p className="lead">{t('Ingresa con tu usuario, correo o número de empleado.')}</p>
      {aviso && <div className="notice" role="status"><Icono nombre="check" /><span>{aviso}</span></div>}
      <Campo name="usuario" id="usuario" label={t('Usuario o correo electrónico')} error={errors.usuario} autoComplete="username" placeholder="jorge.salinas@empresa.com" />
      <Campo name="password" id="password" label={t('Contraseña')} error={errors.password} type="password" autoComplete="current-password" />
      <button type="button" className="link" onClick={() => ir('recuperar')}>{t('¿Olvidaste tu contraseña?')}</button>
      <p className="error" role="alert">{error}</p>
      <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
        {t(loading ? 'Ingresando…' : 'Ingresar')}
      </button>
      <p className="muted" style={{ textAlign: 'center' }}>
        {t('¿No tienes cuenta?')} <button type="button" className="link" onClick={() => ir('registro')}>{t('Registrarse')}</button>
      </p>
      <div className="demo-links">
        <span>{t('Entrar en modo demo como:')}</span>
        {DEMOS.map(([puesto, nombre, usuario]) => (
          <button key={usuario} type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={() => demo(usuario)}>{rol(puesto)} · {nombre}</button>
        ))}
      </div>
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
    if (!/^\d{6}$/.test(codigo)) return setError(t('El código debe tener 6 dígitos.'))
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
      <h1>{t('Verificación en dos pasos')}</h1>
      <p className="lead">{t('Escribe el código de 6 dígitos que enviamos a')} <b>{verificacion.destino}</b></p>
      {/* shortcut: código visible porque el envío por correo está simulado; quitar al conectar el servicio de email */}
      <div className="notice warn" role="status">
        <Icono nombre="alert" />
        <span>{t('Modo de prueba: el correo es simulado. Tu código es')} <b className="mono">{simulado}</b></span>
      </div>
      <Campo label={t('Código de verificación')} id="codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
        className="codigo" value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} autoFocus />
      <p className="error" role="alert">{error}</p>
      <button className="btn btn-primary btn-block" type="submit" disabled={enviando}>{t(enviando ? 'Verificando…' : 'Verificar')}</button>
      <div className="row between">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => volver()}>← {t('Volver')}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={reenviar}>{t('Reenviar código')}</button>
      </div>
    </form>
  )
}
