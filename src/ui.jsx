import { ESTADOS } from './comun.js'

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
