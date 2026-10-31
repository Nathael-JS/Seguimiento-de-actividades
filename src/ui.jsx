import { ESTADOS, reglasPassword } from './comun.js'
import Icono from './Icono.jsx'

export function Notificacion({ n }) {
  const quien = <b>{n.who}</b>
  if (n.kind === 'assigned') return <>{quien} te asignó {n.count} actividades</>
  if (n.kind === 'comment') return <>{quien} comentó en “{n.actividad}”</>
  if (n.kind === 'inherited') return <>{quien} heredó “{n.actividad}”</>
  return <>{quien} actualizó “{n.actividad}” → {ESTADOS[n.kind]}</>
}

export function Anillo({ pct, size = 64, width = 7 }) {
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
  return <span className={`badge badge-${estado}`}>{ESTADOS[estado]}</span>
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
      <Campo label={etiqueta} id="p1" type="password" autoComplete="new-password" value={p1} onChange={(e) => onChange(e.target.value, p2)} />
      <div className="meter" aria-hidden="true"><i style={{ width: `${(cumplidas / 5) * 100}%`, background: color }} /></div>
      <Campo label="Confirmar contraseña" id="p2" type="password" autoComplete="new-password" value={p2} onChange={(e) => onChange(p1, e.target.value)} />
      <ul className="rules" aria-label="Requisitos de la contraseña">
        {reglas.map(([texto, ok]) => <li key={texto} className={ok ? 'ok' : ''}>{texto}<span className="sr">{ok ? ': cumplido' : ': pendiente'}</span></li>)}
      </ul>
      <div className="notice"><Icono nombre="shield" /><span>Por seguridad, la contraseña se cambia cada 3 meses.</span></div>
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
        {vencida ? 'Tu contraseña venció.' : <>Tu contraseña vence en <b>{dias} {dias === 1 ? 'día' : 'días'}</b>.</>}
        {enlace ? <> <a href="#perfil">Cambiar ahora</a></> : ' Por seguridad, la contraseña se cambia cada 3 meses.'}
      </span>
    </div>
  )
}
