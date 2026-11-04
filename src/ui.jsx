import { Component, useId, useState } from 'react'
import { CRITICIDADES, api, columnaTablero, criticidad, fechaHora, iniciales, estado as nombreEstado, reglasPassword, reportarError } from './comun.js'
import Icono from './Icono.jsx'
import { cambiarIdioma, idiomaActual, t } from './i18n.js'

// Si una pantalla falla al dibujarse, en vez de quedar en blanco muestra qué hacer y lo reporta al servidor
export class SiFalla extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error) { reportarError(error) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <section className="card falla" role="alert">
        <h1>{t('Algo falló en esta pantalla')}</h1>
        <p className="muted">{t('Ya se avisó al sistema. Recarga la página; si se repite, avísale a tu administrador.')}</p>
        <button type="button" className="btn btn-primary" onClick={() => location.reload()}>{t('Recargar')}</button>
      </section>
    )
  }
}

// Logo: el reloj de turnos de la portada (A, B y C) con una palomita al centro. Es el mismo dibujo que public/favicon.svg
export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="#14303f" />
      <g fill="none" strokeWidth="3.2" strokeLinecap="round">
        <path d="M25.38 17.49A9.5 9.5 0 0 1 12.6 24.87" stroke="#3cc2b8" />
        <path d="M10.02 23.38A9.5 9.5 0 0 1 10.02 8.62" stroke="#f5b25c" />
        <path d="M12.6 7.13A9.5 9.5 0 0 1 25.38 14.51" stroke="#a9c3d6" />
        <path d="M12 16.3l2.9 2.9 5.4-5.9" stroke="#fff" strokeWidth="2.6" strokeLinejoin="round" />
      </g>
    </svg>
  )
}

export function Notificacion({ n }) {
  const quien = <b>{n.who}</b>
  if (n.kind === 'assigned') return <>{quien} {t(n.count === 1 ? 'te asignó {n} actividad' : 'te asignó {n} actividades', { n: n.count })}</>
  if (n.kind === 'comment') return <>{quien} {t('comentó en')} “{n.actividad}”</>
  if (n.kind === 'inherited') return <>{quien} {t('heredó')} “{n.actividad}”</>
  if (n.kind === 'propia' && n.count > 1) return <>{quien} {t('agregó {n} tareas, entre ellas', { n: n.count })} “{n.actividad}”</>
  if (n.kind === 'propia') return <>{quien} {t(n.urgente ? 'agregó una tarea urgente' : 'agregó una tarea')} “{n.actividad}”</>
  if (n.kind === 'urgent-closed') {
    return n.who
      ? <>{quien} {t('no completó la tarea urgente')} “{n.actividad}” {t('antes de cerrar su turno')}</>
      : <>{t('Tu tarea urgente')} “{n.actividad}” {t('se cerró sin completarse al terminar el turno')}</>
  }
  if (n.kind === 'overdue') {
    // Sin who: el aviso es para quien tiene la actividad; con who: para quien la asignó
    return n.who ? <>{quien} {t('tiene atrasada')} “{n.actividad}”</> : <>{t('Tu actividad')} “{n.actividad}” {t('está atrasada')}</>
  }
  if (n.kind === 'editada') return <>{quien} {t('editó')} “{n.actividad}”</>
  if (n.kind === 'urgente') return <>{quien} {t('marcó como urgente')} “{n.actividad}”</>
  if (n.kind.startsWith('solicitud')) {
    const datos = { actividad: n.actividad, columna: columnaTablero(n.columna) }
    const texto = { solicitud: 'pide mover “{actividad}” a {columna}: valídalo en el Tablero', 'solicitud-ok': 'aprobó mover “{actividad}” a {columna}', 'solicitud-no': 'no aprobó mover “{actividad}” a {columna}' }[n.kind]
    return <>{quien} {t(texto, datos)}</>
  }
  if (n.kind === 'herencia-pendiente') return <>{quien} {t('propone heredar')} “{n.actividad}” {t('a alguien de tu equipo: valídala')}</>
  if (n.kind === 'herencia-aceptada') return <>{quien} {t('aceptó tu herencia de')} “{n.actividad}”</>
  if (n.kind === 'herencia-rechazada') return <>{quien} {t('rechazó tu herencia de')} “{n.actividad}”</>
  if (n.kind === 'herencia-redirigida') return <>{quien} {t('redirigió tu herencia de')} “{n.actividad}”</>
  if (n.kind === 'herencia-anulada') return <>{t('Se anuló tu herencia de')} “{n.actividad}”: {t('ya no estaba pendiente')}</>
  if (n.kind === 'password') {
    return n.count > 0 ? t(n.count === 1 ? 'Tu contraseña vence en {n} día' : 'Tu contraseña vence en {n} días', { n: n.count }) : t('Tu contraseña venció.')
  }
  return <>{quien} {t('actualizó')} “{n.actividad}” → {nombreEstado(n.kind)}</>
}

// pct null = sin actividades: anillo vacío con "—" (un 0 % se leería como atraso)
export function Anillo({ pct, size = 64, width = 7 }) {
  if (pct == null) {
    return (
      <span className="ring" role="img" aria-label={t('Sin actividades')}>
        <svg width={size} height={size}><circle className="ring-track" cx={size / 2} cy={size / 2} r={(size - width) / 2} fill="none" strokeWidth={width} /></svg>
        <b className="muted">—</b>
      </span>
    )
  }
  const r = (size - width) / 2
  const c = 2 * Math.PI * r
  const nivel = pct >= 100 ? 'is-done' : pct < 35 ? 'is-low' : pct < 70 ? 'is-mid' : ''
  return (
    <span className={`ring ${nivel}`} role="img" aria-label={`${pct}%`}>
      <svg width={size} height={size}>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={width} />
        <circle className="ring-value" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={width}
          strokeDasharray={c.toFixed(2)} strokeDashoffset={(c * (1 - pct / 100)).toFixed(2)} />
      </svg>
      <b>{pct}%</b>
    </span>
  )
}

export function Estado({ estado }) {
  return <span className={`badge badge-${estado}`}>{nombreEstado(estado)}</span>
}

export function Campo({ label, error, id, children, ...props }) {
  return (
    <label className={`field${error ? ' is-error' : ''}`}>
      <span>{label}</span>
      {children ?? <input id={id} maxLength={100} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} {...props} />}
      {error && <small id={`${id}-error`}>{error}</small>}
    </label>
  )
}

// Contraseña nueva + confirmación, con barra de fuerza y la lista de reglas
export function PasswordNueva({ p1, p2, onChange, etiqueta = 'Nueva contraseña' }) {
  const reglas = reglasPassword(p1, p2)
  const cumplidas = reglas.filter(([, ok]) => ok).length
  const color = cumplidas < 3 ? 'var(--status-incomplete)' : cumplidas < 5 ? 'var(--status-pending)' : 'var(--status-done)'
  return (
    <>
      <Campo label={t(etiqueta)} id="p1" type="password" autoComplete="new-password" value={p1} onChange={(e) => onChange(e.target.value, p2)} />
      <div className="meter" aria-hidden="true"><i style={{ width: `${(cumplidas / 5) * 100}%`, background: color }} /></div>
      <Campo label={t('Confirmar contraseña')} id="p2" type="password" autoComplete="new-password" value={p2} onChange={(e) => onChange(p1, e.target.value)} />
      <ul className="rules" aria-label={t('Requisitos de la contraseña')}>
        {reglas.map(([texto, ok]) => <li key={texto} className={ok ? 'ok' : ''}>{t(texto)}<span className="sr">{t(ok ? ': cumplido' : ': pendiente')}</span></li>)}
      </ul>
      <div className="notice"><Icono nombre="shield" /><span>{t('Por seguridad, la contraseña se cambia cada 3 meses.')}</span></div>
    </>
  )
}

// La contraseña vence cada 90 días: en Inicio se avisa desde 15 días antes; en Perfil siempre
export function AvisoPassword({ dias, siempre = false, enlace = false }) {
  if (dias == null || (!siempre && dias > 15)) return null
  const vencida = dias <= 0
  return (
    <div className={`notice${vencida || dias <= 15 ? ' warn' : ''}`} role="status">
      <Icono nombre="alert" />
      <span>
        {vencida ? t('Tu contraseña venció.') : <>{t('Tu contraseña vence en')} <b>{dias} {t(dias === 1 ? 'día' : 'días')}</b>.</>}
        {' '}{enlace ? <a href="#perfil">{t('Cambiar ahora')}</a> : t('Por seguridad, la contraseña se cambia cada 3 meses.')}
      </span>
    </div>
  )
}

export function BotonTema() {
  const [tema, setTema] = useState(() => document.documentElement.dataset.theme)
  const otro = tema === 'dark' ? 'light' : 'dark'
  function cambiar() {
    document.documentElement.dataset.theme = otro
    try { localStorage.setItem('tema', otro) } catch { /* sin almacenamiento: el tema dura hasta recargar */ }
    setTema(otro)
  }
  return (
    <button type="button" className="iconbtn" onClick={cambiar} aria-label={t(otro === 'dark' ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro')}>
      <Icono nombre={otro === 'dark' ? 'moon' : 'sun'} />
    </button>
  )
}

export function BotonIdioma() {
  return (
    <div className="seg" role="group" aria-label={t('Idioma')}>
      {['es', 'en'].map((k) => (
        <button key={k} type="button" lang={k} aria-pressed={idiomaActual() === k} onClick={() => cambiarIdioma(k)}>{k.toUpperCase()}</button>
      ))}
    </div>
  )
}

// A dónde lleva una notificación: a atender la actividad (la propia o la del equipo) o al Perfil
function destinoDe(n, user) {
  if (n.kind === 'password') return 'perfil'
  if (n.kind.startsWith('herencia-')) return 'herencias'
  if (n.kind.startsWith('solicitud')) return 'tablero'
  return (n.activityTo ?? user.no) === user.no ? 'mis-actividades' : 'monitoreo'
}

// Notificación que se puede tocar: la marca como leída y lleva a donde se atiende
export function ItemNotificacion({ n, user, recargar, avatar = false }) {
  function abrir() {
    // No se espera ni se avisa si falla: el enlace igual lleva a la actividad y la próxima recarga corrige el contador
    if (!n.read) api(`/api/notificaciones/${user.no}/${n.id}/leida`, { method: 'POST' }).then(recargar, () => {})
  }
  return (
    <li>
      <a className={`notif${n.read ? '' : ' unread'}`} href={`#${destinoDe(n, user)}`} onClick={abrir}>
        <span className={`ndot ${n.kind}`} />
        {avatar && (
          <span className="avatar" style={{ width: 32, height: 32, fontSize: 12 }}>{n.who ? iniciales(n.who) : <Icono nombre="alert" />}</span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Notificacion n={n} />
          <div className="muted mono" style={{ fontSize: 12, fontWeight: 400 }}>{fechaHora(n.at)}</div>
        </div>
        {avatar && !n.read && <span className="tag">{t('Nueva')}</span>}
      </a>
    </li>
  )
}

// Panel con título que se puede minimizar: queda solo su barra con el nombre (se recuerda en el navegador).
// acciones: enlaces junto al título, solo con el panel abierto
export function Panel({ id, titulo, acciones, className = '', children }) {
  const clave = `panel-${id}`
  const cuerpo = useId()
  const [abierto, setAbierto] = useState(() => { try { return localStorage.getItem(clave) !== '0' } catch { return true } })
  function alternar() {
    setAbierto(!abierto)
    try { localStorage.setItem(clave, abierto ? '0' : '1') } catch { /* solo esta vez */ }
  }
  return (
    <section className={`card panel${abierto ? '' : ' minimizado'} ${className}`}>
      <div className="panel-cabeza">
        <h2 className="card-title">{titulo}</h2>
        {abierto && acciones}
        <button type="button" className="iconbtn panel-alternar" onClick={alternar} aria-expanded={abierto} aria-controls={cuerpo}
          aria-label={t(abierto ? 'Minimizar {panel}' : 'Mostrar {panel}', { panel: titulo })} title={t(abierto ? 'Minimizar' : 'Mostrar')}>
          <Icono nombre="abajo" />
        </button>
      </div>
      <div id={cuerpo} hidden={!abierto}>{children}</div>
    </section>
  )
}

export function NotificacionesRecientes({ user, notificaciones, recargar }) {
  return (
    <Panel id="notificaciones" titulo={t('Notificaciones recientes')} acciones={<a href="#buzon" style={{ fontSize: 13 }}>{t('Ver todas')}</a>}>
      {notificaciones.length ? (
        <ul className="list">
          {notificaciones.slice(0, 5).map((n) => <ItemNotificacion key={n.id} n={n} user={user} recargar={recargar} />)}
        </ul>
      ) : <p className="muted">{t('Sin notificaciones.')}</p>}
    </Panel>
  )
}

// Rate de aprobación con barra; naranja por debajo de 85 %
export function Rate({ valor }) {
  if (valor == null) return <span className="muted">{t('Sin datos')}</span>
  return (
    <span className={`rate${valor < 85 ? ' lo' : ''}`}>
      <span className="bar"><i style={{ width: `${valor}%` }} /></span>
      <span className="mono">{valor}%</span>
    </span>
  )
}

// Etiqueta de criticidad: la normal no se marca, para que resalte lo que se sale de lo común
export function Criticidad({ valor }) {
  if (!valor || valor === 'normal' || valor === 'nueva') return null
  return <span className={`tag crit-${valor}`}>{criticidad(valor)}</span>
}

export function SelectorCriticidad({ valor, onChange }) {
  return (
    <fieldset className="field">
      <legend>{t('Criticidad')}</legend>
      <div className="chips crit" role="group">
        {Object.keys(CRITICIDADES).map((k) => (
          <button key={k} type="button" data-crit={k} aria-pressed={valor === k} onClick={() => onChange(k)}>{criticidad(k)}</button>
        ))}
      </div>
      {valor === 'critica' && <small>{t('Va después de las urgentes. Se puede pasar directo al turno siguiente una vez al día, sin validación.')}</small>}
    </fieldset>
  )
}
