import { useEffect, useState } from 'react'
import { TURNOS, api, depto, nombreTurno, turnoLargo } from './comun.js'
import TableroGerente from './TableroGerente.jsx'
import { t } from './i18n.js'
import { Anillo, AvisoPassword, Criticidad, Estado, NotificacionesRecientes, Panel } from './ui.jsx'

export default function Inicio({ user, datos, error, recargar, avisar }) {
  return (
    <>
      <div className="page-head">
        <h1>{t('Hola, {nombre}', { nombre: user.name.split(' ')[0] })}</h1>
        <p>{t('Turno de hoy')}: {turnoLargo(user.shift)} · {TURNOS[user.shift]} · {depto(user.dept)}</p>
      </div>
      <AvisoPassword dias={datos?.diasPassword} enlace />

      {error ? <p className="error" role="alert">{error}</p> : !datos ? <p className="muted">{t('Cargando…')}</p> : (
        <>
          <section className="kpis">
            <Kpi n={datos.asignadas} label={t('Abiertas y realizadas hoy')} />
            <Kpi n={datos.realizadas} label={t('Realizadas hoy')} color="var(--status-done)" />
            <Kpi n={datos.abiertas} label={t('Pendientes o incompletas')} color="var(--status-pending)" />
            <div className="card kpi"><Anillo pct={datos.avance} /><div className="l">{t('Realizadas')}</div></div>
          </section>

          {/* El gerente ve el tablero de su área; los demás, lo que tienen por hacer (el menú ya lleva a cada módulo) */}
          {user.role === 'gte' ? <TableroGerente user={user} notificaciones={datos.notificaciones} recargar={recargar} avisar={avisar} /> : (
            <div className="cols">
              <TareasAbiertas user={user} />
              <NotificacionesRecientes user={user} notificaciones={datos.notificaciones} recargar={recargar} />
            </div>
          )}
        </>
      )}
    </>
  )
}

function Kpi({ n, label, color }) {
  return (
    <div className="card kpi">
      <div><div className="n" style={{ color }}>{n}</div><div className="l">{label}</div></div>
    </div>
  )
}

// Las tareas que siguen abiertas, en el orden de Mis actividades (urgentes primero, luego por criticidad)
const VISIBLES = 5
function TareasAbiertas({ user }) {
  const [tareas, setTareas] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api(`/api/actividades/${user.no}`).then((l) => setTareas(l.filter((a) => a.status !== 'done' && !a.cerrada))).catch((e) => setError(e.message))
  }, [user.no])

  return (
    <Panel id="tareas-abiertas" titulo={t('Tus tareas abiertas')}
      acciones={tareas?.length > 0 && <a href="#mis-actividades" style={{ fontSize: 13 }}>{t('Actualizar estado')}</a>}>
      {error ? <p className="error" role="alert">{error}</p>
        : !tareas ? <p className="muted">{t('Cargando…')}</p>
        : !tareas.length ? <p className="empty">{t('No tienes tareas abiertas. Cuando te asignen una, llega aquí y a tu buzón.')}</p>
        : (
          <ul className="list abiertas">
            {tareas.slice(0, VISIBLES).map((a) => (
              <li key={a.id}>
                <a href="#mis-actividades">
                  <span className="quien">
                    <b>{a.text}</b>
                    <span className="meta">{a.date} · {nombreTurno(a.shift)}</span>
                  </span>
                  <span className="row" style={{ gap: 6, flex: 'none' }}>
                    {a.prioridad === 'urgente' && <span className="tag urgente">{t('Urgente')}</span>}
                    <Criticidad valor={a.criticidad} />
                    <Estado estado={a.status} />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      {tareas?.length > VISIBLES && <a href="#mis-actividades" className="mas">{t('Ver las {n} tareas', { n: tareas.length })}</a>}
    </Panel>
  )
}
