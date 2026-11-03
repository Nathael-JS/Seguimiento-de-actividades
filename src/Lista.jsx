import { useState } from 'react'
import { ESTADOS, PESO_CRITICIDAD, criticidad, dia, estado as nombreEstado, hace, iniciales, pctRealizadas } from './comun.js'
import { t } from './i18n.js'
import { Anillo, Estado } from './ui.jsx'

// Lista de actividades (como la vista de lista de SharePoint): una fila por actividad, lo urgente y lo más
// crítico arriba. Con cambiarEstado (Mis actividades) el estado se cambia ahí mismo
const peso = (a) => (a.prioridad === 'urgente' && !a.cerrada ? 10 : PESO_CRITICIDAD[a.criticidad ?? 'normal'])
const orden = (x, y) => (x.status === 'done') - (y.status === 'done') || peso(y) - peso(x) || x.date.localeCompare(y.date) || x.id - y.id

export function ListaActividades({ filas, nombres, conPersona = false, cambiarEstado }) {
  const COLUMNAS = ['Actividad', 'Prioridad', 'Estado', ...(conPersona ? ['Asignada a'] : []), 'Fecha', 'Creada', 'Creada por']
  if (!filas.length) return <section className="card empty">{t('No hay actividades en esta vista.')}</section>
  return (
    <div className="table-wrap">
      <table className="lista-act">
        <thead><tr>{COLUMNAS.map((c) => <th key={c} scope="col">{t(c)}</th>)}</tr></thead>
        <tbody>
          {[...filas].sort(orden).map((a) => (
            <tr key={a.id} className={a.status === 'done' ? 'hecha' : ''}>
              <th scope="row">
                <span className="titulo">{a.text}</span>
                {a.mgr && <span className="meta">{a.mgr}</span>}
              </th>
              <td><Prioridad a={a} /></td>
              <td>
                {cambiarEstado && !a.cerrada ? (
                  <select className={`estado-sel s-${a.status}`} aria-label={t('Estado de “{actividad}”', { actividad: a.text })}
                    value={a.status} onChange={(e) => cambiarEstado(a, e.target.value)}>
                    {Object.keys(ESTADOS).map((k) => <option key={k} value={k}>{nombreEstado(k)}</option>)}
                  </select>
                ) : <Estado estado={a.status} />}
              </td>
              {conPersona && (
                <td><span className="persona"><span className="avatar">{iniciales(a.persona)}</span>{a.persona}</span></td>
              )}
              <td className="nowrap"><span className="mono">{dia(a.date)}</span> · {t('Turno')} {a.shift}</td>
              <td className="nowrap meta" title={new Date(a.at).toLocaleString()}>{hace(a.at)}</td>
              <td className="nowrap">{a.propia ? t('Registrada por sí mismo') : nombres[a.by] ?? a.byName ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Prioridad({ a }) {
  if (a.prioridad === 'urgente') return <span className="tag urgente">{t('Urgente')}</span>
  const c = a.criticidad ?? 'normal'
  return <span className={`tag prio crit-${c}`}>{c === 'nueva' ? t('Por clasificar') : criticidad(c)}</span>
}

// % de actividades realizadas: el botón despliega el detalle por persona (animado, sin mover el resto de golpe)
export function PorcentajeRealizadas({ grupos }) {
  const [abierto, setAbierto] = useState(false)
  const todas = grupos.flatMap((g) => g.acts)
  const pct = todas.length ? pctRealizadas(todas) : null
  return (
    <div className={`pct-realizadas${abierto ? ' abierto' : ''}`}>
      <button type="button" className="pct-boton" aria-expanded={abierto} aria-controls="detalle-realizadas" onClick={() => setAbierto(!abierto)}>
        <Anillo pct={pct} size={44} width={5} />
        <span><b>{t('Realizadas')}</b><small>{t('{a} de {b}', { a: todas.filter((x) => x.status === 'done').length, b: todas.length })}</small></span>
        <span className="flecha" aria-hidden="true">▾</span>
      </button>
      <div className="pct-detalle" id="detalle-realizadas">
        <div>
          <ul>
            {grupos.filter((g) => g.acts.length).map((g) => {
              const v = pctRealizadas(g.acts)
              return (
                <li key={g.no}>
                  <span className="nombre">{g.name}</span>
                  <span className="barra"><i style={{ width: `${v}%` }} /></span>
                  <span className="mono">{v}%</span>
                  <span className="meta">{t('{a} de {b}', { a: g.acts.filter((x) => x.status === 'done').length, b: g.acts.length })}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
