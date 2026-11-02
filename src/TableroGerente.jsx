import { useEffect, useState } from 'react'
import { TURNOS, api, hoy, iniciales, inicioDeHoy, rol } from './comun.js'
import { t } from './i18n.js'
import { resumenArea } from './tablero.js'
import { Anillo, Estado, NotificacionesRecientes } from './ui.jsx'

// Inicio del gerente: avance por líder y por turno, y lo que necesita atención en su área
export default function TableroGerente({ user, notificaciones }) {
  const [equipo, setEquipo] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api(`/api/equipo/${user.no}?desde=${encodeURIComponent(inicioDeHoy())}`).then(setEquipo).catch((e) => setError(e.message))
  }, [user.no])

  if (error) return <p className="error" role="alert">{error}</p>
  if (!equipo) return <p className="muted">{t('Cargando…')}</p>

  const r = resumenArea(equipo, hoy())
  // Singular o plural según la cantidad
  const cuenta = (n, uno, varios) => t(n === 1 ? uno : varios, { n })
  const actividades = (n) => cuenta(n, '{n} actividad', '{n} actividades')
  const cifras = (x) => [actividades(x.actividades), cuenta(x.realizadas, '{n} realizada hoy', '{n} realizadas hoy'),
    cuenta(x.incompletas, '{n} incompleta', '{n} incompletas')].join(' · ')

  return (
    <div className="cols">
      <div className="pila">
        <section className="card">
          <h2 className="card-title">{t('Avance por líder')}</h2>
          {r.lideres.length ? (
            <ul className="list">
              {r.lideres.map((l) => (
                <li key={l.no} className="lider">
                  <span className="avatar">{iniciales(l.name)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{l.name}</b> <span className="muted" style={{ fontSize: 13 }}>· {rol(l.role)} · {cuenta(l.personas, '{n} persona', '{n} personas')}</span>
                    <div className="muted" style={{ fontSize: 13 }}>{cifras(l)}</div>
                  </div>
                  <Anillo pct={l.avance} size={56} width={6} />
                </li>
              ))}
            </ul>
          ) : <p className="muted">{t('Sin líderes en tu área.')}</p>}
        </section>

        <section>
          <h2 className="card-title" style={{ marginBottom: 12 }}>{t('Avance por turno')}</h2>
          <div className="turnos">
            {r.turnos.map((x) => (
              <div key={x.turno} className="card turno">
                <Anillo pct={x.avance} size={56} width={6} />
                <div>
                  <b>{t('Turno')} {x.turno}</b>
                  <div className="muted mono" style={{ fontSize: 12 }}>{TURNOS[x.turno]}</div>
                  <div className="muted" style={{ fontSize: 13 }}>{actividades(x.actividades)}</div>
                  <div className="muted" style={{ fontSize: 13 }}>{cuenta(x.personas, '{n} persona', '{n} personas')}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="pila">
        <section className="card">
          <h2 className="card-title">{t('Requieren atención')}</h2>
          <Alerta titulo={t('Incompletas')} lista={r.incompletas} />
          <Alerta titulo={t('Atrasadas')} lista={r.atrasadas} />
          <div className="alerta">
            <h3>{t('Sin actividades hoy')} <span className="mono muted">{r.sinActividades.length}</span></h3>
            {r.sinActividades.length ? (
              <div className="chips-estaticos">{r.sinActividades.map((e) => <span key={e.no} className="chip">{e.name} · {t('Turno')} {e.shift}</span>)}</div>
            ) : <p className="muted">{t('Todos tienen actividades.')}</p>}
          </div>
        </section>
        <NotificacionesRecientes notificaciones={notificaciones} />
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
              <span title={a.text}>{a.text} <span className="muted">· {a.persona} · <span className="mono">{a.date}</span></span></span>
              <Estado estado={a.status} />
            </li>
          ))}
          {lista.length > 5 && <li className="muted"><a href="#monitoreo">{t('Ver {n} más en Monitoreo', { n: lista.length - 5 })}</a></li>}
        </ul>
      ) : <p className="muted">{t('Nada por ahora.')}</p>}
    </div>
  )
}
