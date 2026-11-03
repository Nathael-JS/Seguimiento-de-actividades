import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { api } from './comun.js'
import Icono from './Icono.jsx'
import Recuperar from './Recuperar.jsx'
import Registro from './Registro.jsx'
import { BotonIdioma, BotonTema, Campo } from './ui.jsx'
import { t } from './i18n.js'

// Pantallas de acceso: 'login' → 'codigo' (2 pasos), o 'registro' / 'recuperar' que vuelven al login
export default function Login({ onLogin, aviso: avisoInicial = '' }) {
  const [pantalla, setPantalla] = useState('login')
  const [verificacion, setVerificacion] = useState(null)
  const [aviso, setAviso] = useState(avisoInicial)

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
    </form>
  )
}

// Paso 2: código de la app autenticadora. La primera vez (alta) se muestra el QR y la clave para vincularla
function Codigo({ verificacion, onLogin, volver }) {
  const { token, secreto, uri } = verificacion
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function verificar(e) {
    e.preventDefault()
    if (!/^\d{6}$/.test(codigo)) return setError(t('El código debe tener 6 dígitos.'))
    setError('')
    setEnviando(true)
    try {
      onLogin(await api('/api/login/verificar', { method: 'POST', body: { token, codigo } }))
    } catch (err) {
      setError(err.message)
      setCodigo('')
      setEnviando(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={verificar} noValidate>
      <span className="avatar" style={{ width: 48, height: 48 }}><Icono nombre="shield" /></span>
      <h1>{t(secreto ? 'Vincula tu app autenticadora' : 'Verificación en dos pasos')}</h1>
      {secreto ? <Alta secreto={secreto} uri={uri} /> : (
        <p className="lead">{t('Abre tu app autenticadora y escribe el código de 6 dígitos de Seguimiento de Actividades.')}</p>
      )}
      <Campo label={t('Código de la app')} id="codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
        className="codigo" value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} autoFocus={!secreto} />
      <p className="error" role="alert">{error}</p>
      <button className="btn btn-primary btn-block" type="submit" disabled={enviando}>
        {t(enviando ? 'Verificando…' : secreto ? 'Vincular y entrar' : 'Verificar')}
      </button>
      <div className="row">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => volver()}>← {t('Volver')}</button>
      </div>
    </form>
  )
}

function Alta({ secreto, uri }) {
  const [qr, setQr] = useState('')
  const [copiada, setCopiada] = useState(false)
  // Siempre oscuro sobre blanco, también en tema oscuro: así lo leen todas las cámaras
  useEffect(() => {
    QRCode.toString(uri, { type: 'svg', margin: 1, color: { dark: '#16202a', light: '#ffffff' } }).then(setQr)
  }, [uri])

  async function copiar() {
    try {
      await navigator.clipboard.writeText(secreto)
      setCopiada(true)
    } catch { /* sin permiso de portapapeles: la clave sigue a la vista para escribirla */ }
  }

  return (
    <>
      <ol className="pasos-alta">
        <li>{t('Instala Google Authenticator o Microsoft Authenticator en tu teléfono.')}</li>
        <li>{t('Escanea el código QR con la app, o escribe la clave.')}</li>
        <li>{t('Escribe el código de 6 dígitos que muestra la app.')}</li>
      </ol>
      <div className="alta-mfa">
        <div className="qr" role="img" aria-label={t('Código QR para vincular la app autenticadora')} dangerouslySetInnerHTML={{ __html: qr }} />
        <div className="clave">
          <span className="muted">{t('Clave')}</span>
          <code>{secreto.match(/.{4}/g).join(' ')}</code>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={copiar}>{t(copiada ? 'Copiada' : 'Copiar clave')}</button>
            <a className="btn btn-ghost btn-sm" href={uri}>{t('Abrir en la app')}</a>
          </div>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>{t('Después de vincularla, cada inicio de sesión pide el código de la app.')}</p>
    </>
  )
}
