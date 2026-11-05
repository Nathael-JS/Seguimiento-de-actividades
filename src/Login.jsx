import { useEffect, useState } from 'react'
import { RANGOS, TURNOS, api, horaActual, turnoDe, turnoLargo } from './comun.js'
import Dial from './Dial.jsx'
import Icono from './Icono.jsx'
import Recuperar from './Recuperar.jsx'
import Registro from './Registro.jsx'
import { BotonIdioma, BotonTema, Campo, Firma, Logo } from './ui.jsx'
import { t } from './i18n.js'

// Portada (slides → elegir acceso) y luego el login de ese acceso: 'login' → 'codigo' (2 pasos), o 'registro' /
// 'recuperar' que vuelven al login
export default function Login({ onLogin, aviso: avisoInicial = '' }) {
  // Con un aviso (sesión terminada) se vuelve directo a elegir acceso, sin repetir la presentación
  const [acceso, setAcceso] = useState(null)
  const [pantalla, setPantalla] = useState('login')
  const [verificacion, setVerificacion] = useState(null)
  const [aviso, setAviso] = useState(avisoInicial)

  const volver = (mensaje = '') => {
    setAviso(mensaje)
    setPantalla('login')
  }

  if (!acceso) return <Portada aviso={aviso} saltar={!!aviso} onElegir={(a) => { setAcceso(a); setPantalla('login') }} />
  const ahora = horaActual()

  return (
    <div className="auth">
      <aside className="auth-art">
        <div className="brandname"><Logo />{t('Seguimiento de Actividades')}</div>
        <Dial hora={ahora} activo={turnoDe(ahora)} className="dial-lateral" />
        <div className="auth-copy">
          <h2>{t(acceso === 'gerencia' ? 'Acceso Gerencia' : 'Acceso Jr / Técnico')}</h2>
          <p>{t(acceso === 'gerencia' ? 'Gerente, Senior e Ing. Full: asignas, validas herencias y sigues a tu equipo.' : 'Ing. Jr y Técnico: actualizas tus tareas y tu encargado se entera al momento.')}</p>
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-top">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAcceso(null)}>← {t('Cambiar acceso')}</button>
          <span className="spacer" />
          <BotonIdioma /><BotonTema />
        </div>
        {pantalla === 'login' && (
          <Credenciales aviso={aviso} ir={setPantalla} acceso={acceso} onLogin={onLogin}
            onPaso1={(v) => { setVerificacion(v); setAviso(''); setPantalla('codigo') }} />
        )}
        {pantalla === 'codigo' && <Codigo verificacion={verificacion} onLogin={onLogin} volver={volver} />}
        {pantalla === 'registro' && <Registro volver={volver} />}
        {pantalla === 'recuperar' && <Recuperar volver={volver} />}
        <Firma />
      </main>
    </div>
  )
}

// Presentación: tres slides, uno por turno, con la aguja del dial avanzando; termina en la elección de acceso.
// Se ve una vez por navegador; después la portada abre directo en la elección
const SLIDES = [
  ['A', 'Asigna el turno por puntos.', 'El encargado reparte las actividades del turno y cada técnico las recibe al instante en su buzón.'],
  ['B', 'Cada avance llega a quien debe.', 'Estado y comentario: el encargado ve el turno moverse sin preguntar por radio.'],
  ['C', 'Lo pendiente cambia de turno, validado.', 'Las herencias pasan con su motivo y las valida el encargado de quien las recibe.'],
]
const VISTA = 'portada-vista'
const leerVista = () => { try { return localStorage.getItem(VISTA) === '1' } catch { return false } }
const PAUSA = 5200

function Portada({ aviso, saltar, onElegir }) {
  const reducido = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const [i, setI] = useState(() => (saltar || leerVista() ? SLIDES.length : 0))
  // Sin movimiento reducido avanza solo, salvo pausa; con él, solo con los puntos o "Siguiente"
  const [pausa, setPausa] = useState(reducido)
  const final = i === SLIDES.length
  const ahora = horaActual()
  // La aguja solo avanza: al llegar al final da la vuelta hasta la hora real
  const [hora, giros] = final ? [ahora, ahora < RANGOS.C[0] ? 1 : 0] : [RANGOS[SLIDES[i][0]][0], 0]

  useEffect(() => {
    if (final) { try { localStorage.setItem(VISTA, '1') } catch { /* sin almacenamiento: se vuelve a ver */ } return }
    if (pausa) return
    const id = setTimeout(() => setI(i + 1), PAUSA)
    return () => clearTimeout(id)
  }, [i, pausa, final])

  const activo = final ? turnoDe(ahora) : SLIDES[i][0]
  return (
    <div className={`portada${final ? ' final' : ''}`}>
      <header className="portada-top">
        <div className="brandname"><Logo />{t('Seguimiento de Actividades')}</div>
        <span className="spacer" />
        <BotonIdioma /><BotonTema />
      </header>

      <div className="portada-cuerpo">
        <Dial hora={hora} giros={giros} activo={activo} className="dial-portada" />

        {final ? (
          <section className="portada-texto entra" key="final" aria-labelledby="portada-titulo">
            <p className="ahora">
              <span className={`punto t-${activo}`} />{t('Ahora: {turno} · {horas}', { turno: turnoLargo(activo), horas: TURNOS[activo] })}
            </p>
            <h1 id="portada-titulo">{t('¿Cómo entras hoy?')}</h1>
            {aviso && <div className="notice warn" role="status"><Icono nombre="alert" /><span>{aviso}</span></div>}
            <ul className="accesos">
              <li>
                <button type="button" onClick={() => onElegir('gerencia')}>
                  <span><b>{t('Gerencia')}</b><small>{t('Gerente, Senior e Ing. Full')}</small></span>
                  <Icono nombre="flecha" />
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onElegir('operativo')}>
                  <span><b>{t('Jr / Técnico')}</b><small>{t('Ing. Jr y Técnico')}</small></span>
                  <Icono nombre="flecha" />
                </button>
              </li>
            </ul>
            <button type="button" className="link repetir" onClick={() => { setI(0); setPausa(reducido) }}>{t('Ver la presentación otra vez')}</button>
          </section>
        ) : (
          <section className="portada-texto entra" key={i} aria-live={pausa ? 'polite' : 'off'}>
            <p className="ahora"><span className={`punto t-${activo}`} />{turnoLargo(activo)} · {TURNOS[activo]}</p>
            <h1>{t(SLIDES[i][1])}</h1>
            <p className="bajada">{t(SLIDES[i][2])}</p>
          </section>
        )}
      </div>

      {!final && (
        <footer className="portada-pie">
          <div className="pasos-slide" role="group" aria-label={t('Presentación')}>
            {SLIDES.map(([turno], k) => (
              <button key={turno} type="button" aria-current={k === i ? 'step' : undefined} aria-label={turnoLargo(turno)}
                onClick={() => setI(k)}>
                {/* La barra se llena en lo que dura el slide: muestra cuánto falta para el siguiente */}
                <i className={k === i && !pausa ? 'llenando' : k < i ? 'lleno' : ''} style={{ animationDuration: `${PAUSA}ms` }} />
              </button>
            ))}
          </div>
          <span className="spacer" />
          {!reducido && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPausa(!pausa)}>{t(pausa ? 'Reanudar' : 'Pausar')}</button>}
          <button type="button" className="btn btn-sm btn-claro" onClick={() => setI(i + 1)}>{t('Siguiente')}</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setI(SLIDES.length)}>{t('Saltar')}</button>
        </footer>
      )}
      <Firma />
    </div>
  )
}


function Credenciales({ aviso, ir, acceso, onPaso1, onLogin }) {
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

    entrar(usuario, password)
  }

  async function entrar(usuario, password) {
    setError('')
    setLoading(true)
    try {
      const r = await api('/api/login', { method: 'POST', body: { usuario, password, tipo: acceso } })
      // Sin token: cuenta de prueba, ya es la sesión
      if (r.token) onPaso1(r)
      else onLogin(r)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <h1>{t(acceso === 'gerencia' ? 'Iniciar sesión · Gerencia' : 'Iniciar sesión · Jr / Técnico')}</h1>
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
    // El generador de QR se descarga solo al vincular la app (casi nadie lo necesita al entrar)
    import('qrcode').then(({ default: QRCode }) => QRCode.toString(uri, { type: 'svg', margin: 1, color: { dark: '#16202a', light: '#ffffff' } })).then(setQr)
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
      <p className="meta">{t('Después de vincularla, cada inicio de sesión pide el código de la app.')}</p>
    </>
  )
}
