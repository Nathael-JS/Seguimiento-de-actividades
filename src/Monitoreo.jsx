import { useEffect, useState } from 'react'
import { api, consultaRate, esEncargado, iniciales, inicioDeHoy, promedio, rol } from './comun.js'
import { t } from './i18n.js'
import { Anillo, Estado, Rate } from './ui.jsx'

const conAvance = (acts) => (acts.length ? promedio(acts) : null)

export default function Monitoreo({ user }) {
  const [equipo, setEquipo] = useState(null)
  const [error, setError] = useState('')
  // 'todos', 'directos' o el número de un líder: él y quienes le reportan directo.
  // #monitoreo?lider=N (desde el Inicio del gerente) abre con ese líder elegido
  const [filtro, setFiltro] = useState(() => new URLSearchParams(location.hash.split('?')[1]).get('lider') ?? 'todos')

  useEffect(() => {
    api(`/api/equipo/${user.no}?desde=${encodeURIComponent(inicioDeHoy())}&${consultaRate()}`).then(setEquipo).catch((e) => setError(e.message))
  }, [user.no])

  if (error) return <p className="error" role="alert">{error}</p>
  if (!equipo) return <p className="muted">{t('Cargando…')}</p>

  const nombres = Object.fromEntries([[user.no, user.name], ...equipo.map((e) => [e.no, e.name])])
  const lideres = equipo.filter((e) => esEncargado(e.role))
  const visibles = equipo.filter((e) =>
    filtro === 'todos' || (filtro === 'directos' ? e.boss === user.no : e.no === filtro || e.boss === filtro))

  return (
    <>
      <div className="page-head row between" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <h1>{t('Monitoreo')}</h1>
          <p>{t('Empleados a tu cargo: actividades abiertas y realizadas hoy.')}</p>
        </div>
        <div className="row">
          <Anillo pct={conAvance(equipo.flatMap((e) => e.actividades))} />
          <span className="muted" style={{ fontSize: 13 }}>{t('Avance promedio')}</span>
        </div>
      </div>

      <div className="chips" role="group" aria-label={t('Filtrar equipo')}>
        <button aria-pressed={filtro === 'todos'} onClick={() => setFiltro('todos')}>{t('Todos')} ({equipo.length})</button>
        <button aria-pressed={filtro === 'directos'} onClick={() => setFiltro('directos')}>{t('Directos')}</button>
        {lideres.map((l) => (
          <button key={l.no} aria-pressed={filtro === l.no} onClick={() => setFiltro(l.no)}>
            {l.name.split(' ')[0]} · {rol(l.role)}
          </button>
        ))}
      </div>

      {visibles.length ? (
        <div className="emp-grid">
          {visibles.map((e) => (
            <article key={e.no} className="card emp-card">
              <header>
                <span className="avatar">{iniciales(e.name)}</span>
                <div className="who">
                  <h3>{e.name}</h3>
                  <div className="muted" style={{ fontSize: 12 }}>{rol(e.role)} · <span className="mono">{e.no}</span> · <span className="nowrap">{t('Turno')} {e.shift}</span></div>
                  <div className="tree">↳ {nombres[e.boss] ?? '—'}</div>
                </div>
                <Anillo pct={conAvance(e.actividades)} size={72} width={8} />
              </header>
              <div className="rate-mini"><span>{t('Rate de aprobación')}</span> <Rate valor={e.rate} /></div>
              {e.actividades.length ? (
                <ul className="mini">
                  {e.actividades.map((a) => (
                    <li key={a.id}>
                      <span title={a.text}>{a.text}</span>
                      <span className="row" style={{ gap: 8, flex: 'none' }}>
                        <span className="mono muted">{a.pct}%</span>
                        <Estado estado={a.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <p className="muted" style={{ fontSize: 13 }}>{t('Sin actividades.')}</p>}
            </article>
          ))}
        </div>
      ) : <section className="card empty">{t('No hay empleados en este filtro.')}</section>}
    </>
  )
}
