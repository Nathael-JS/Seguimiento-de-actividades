import { useEffect, useState } from 'react'
import { TURNOS, api, dia, hoy, inicioDeHoy, nombreTurno, rol } from './comun.js'
import { t } from './i18n.js'
import { resumenArea } from './tablero.js'
import { Anillo, Avatar, Estado, NotificacionesRecientes, Panel } from './ui.jsx'

// Singular o plural según la cantidad
const cuenta = (n, uno, varios) => t(n === 1 ? uno : varios, { n })
const actividades = (n) => cuenta(n, '{n} actividad', '{n} actividades')

// Inicio del gerente: avance por líder y por turno, y lo que necesita atención en su área
export default function TableroGerente({ user, notificaciones, recargar }) {
  const [equipo, setEquipo] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api(`/api/equipo/${user.no}?desde=${encodeURIComponent(inicioDeHoy())}`).then(setEquipo).catch((e) => setError(e.message))
  }, [user.no])

  // El gerente viene en su propia lista (puede asignarse tareas), pero no es líder de sí mismo
  const r = equipo && resumenArea(equipo.filter((e) => e.no !== user.no), hoy())
  const pendientes = r ? r.incompletas.length + r.atrasadas.length + r.sinActividades.length : 0

  return (
    // En una sola columna (móvil y tablet) "Requieren atención" va primero; ver .inicio-gerente en index.css
    <div className="cols inicio-gerente">
      <div className="pila">
        {/* Si falla la carga del equipo, las notificaciones siguen visibles */}
        {error ? <p className="error" role="alert">{error}</p> : !r ? <p className="muted">{t('Cargando…')}</p> : (
          <>
            <Panel id="lideres" titulo={t('Avance por líder')}>
              {r.lideres.length ? (
                <ul className="list">
                  {r.lideres.map((l) => (
                    <li key={l.no}>
                      <a className="lider" href={`#monitoreo?lider=${l.no}`} aria-label={t('Ver el equipo de {nombre} en Monitoreo', { nombre: l.name })}>
                        <Avatar no={l.no} name={l.name} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <b>{l.name}</b> <span className="meta">· {rol(l.role)} · {cuenta(l.personas, '{n} persona', '{n} personas')}</span>
                          <div className="meta">
                            {actividades(l.actividades)}
                            {l.realizadas > 0 && <> · {cuenta(l.realizadas, '{n} realizada hoy', '{n} realizadas hoy')}</>}
                            {l.incompletas > 0 && <> · <span className="txt-incompleta">{cuenta(l.incompletas, '{n} incompleta', '{n} incompletas')}</span></>}
                          </div>
                        </div>
                        <Anillo pct={l.avance} size={56} width={6} />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : <p className="muted">{t('Sin líderes en tu área.')}</p>}
            </Panel>

            <Panel id="turnos" titulo={t('Avance por turno')}>
              <div className="turnos">
                {r.turnos.map((x) => (
                  <div key={x.turno} className="turno">
                    <Anillo pct={x.avance} size={56} width={6} />
                    <div>
                      <b>{nombreTurno(x.turno)}</b>
                      <div className="muted mono" style={{ fontSize: 12 }}>{TURNOS[x.turno]}</div>
                      <div className="meta">{actividades(x.actividades)}</div>
                      <div className="meta">{cuenta(x.personas, '{n} persona', '{n} personas')}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </>
        )}
      </div>

      <div className="pila">
        {r && (
          <Panel id="atencion" className={`atencion${pendientes ? ' hay' : ''}`} titulo={t('Requieren atención')}>
            <Alerta titulo={t('Incompletas')} lista={r.incompletas} />
            <Alerta titulo={t('Atrasadas')} lista={r.atrasadas} />
            <div className="alerta">
              <h3>{t('Sin actividades hoy')} <span className="mono muted">{r.sinActividades.length}</span></h3>
              {r.sinActividades.length ? (
                <div className="chips-estaticos">{r.sinActividades.map((e) => <span key={e.no} className="chip">{e.name} · {nombreTurno(e.shift)}</span>)}</div>
              ) : <p className="muted">{t('Todos tienen actividades.')}</p>}
            </div>
          </Panel>
        )}
        <NotificacionesRecientes user={user} notificaciones={notificaciones} recargar={recargar} />
      </div>
    </div>
  )
}

function Alerta({ titulo, lista }) {
  return (
    <div className="alerta">
      <h3>{titulo} <span className="mono muted">{lista.length}</span></h3>
      {lista.length ? (
        <ul className="mini">
          {lista.slice(0, 5).map((a) => (
            <li key={a.id}>
              <span>
                <span className="cortar" title={a.text}>{a.text}</span>
                <span className="muted sub">{a.persona} · {dia(a.date)}</span>
              </span>
              <Estado estado={a.status} />
            </li>
          ))}
          {lista.length > 5 && <li><a href="#monitoreo">{t('Ver {n} más en Monitoreo', { n: lista.length - 5 })}</a></li>}
        </ul>
      ) : <p className="muted">{t('Nada por ahora.')}</p>}
    </div>
  )
}
