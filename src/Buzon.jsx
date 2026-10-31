import { useState } from 'react'
import { api, fechaHora, iniciales } from './comun.js'
import { Notificacion } from './ui.jsx'

// Filtro → tipos de notificación que incluye
const FILTROS = [
  ['Todas', null],
  ['Registradas', ['assigned', 'inherited']],
  ['Realizadas', ['done']],
  ['Pendientes', ['pending']],
  ['Incompletas', ['incomplete']],
  ['Comentarios', ['comment']],
]

export default function Buzon({ user, datos, error, recargar }) {
  const [filtro, setFiltro] = useState(0)
  const [errorAccion, setErrorAccion] = useState('')
  const tipos = FILTROS[filtro][1]
  const lista = datos?.notificaciones.filter((n) => !tipos || tipos.includes(n.kind))

  async function marcarLeidas() {
    setErrorAccion('')
    try {
      await api(`/api/notificaciones/${user.no}/leidas`, { method: 'POST' })
      recargar()
    } catch (e) {
      setErrorAccion(e.message)
    }
  }

  return (
    <>
      <div className="page-head row between" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <h1>Buzón</h1>
          <p>Notificaciones de actividades registradas, realizadas, pendientes, incompletas y comentarios.</p>
        </div>
        <button className="btn btn-secondary" onClick={marcarLeidas}
          disabled={!datos?.notificaciones.some((n) => !n.read)}>
          Marcar todo como leído
        </button>
      </div>

      <div className="chips" role="group" aria-label="Filtrar notificaciones">
        {FILTROS.map(([nombre], i) => (
          <button key={nombre} aria-pressed={filtro === i} onClick={() => setFiltro(i)}>{nombre}</button>
        ))}
      </div>

      {(error || errorAccion) && <p className="error" role="alert">{error || errorAccion}</p>}
      {!datos ? !error && <p className="muted">Cargando…</p> : (
        <section className="card">
          {lista.length ? (
            <ul className="list">
              {lista.map((n) => (
                <li key={n.id}>
                  <span className={`ndot ${n.kind}`} />
                  <span className="avatar" style={{ width: 32, height: 32, fontSize: 12 }}>{iniciales(n.who)}</span>
                  <div style={{ flex: 1 }} className={n.read ? '' : 'unread'}>
                    <Notificacion n={n} />
                    <div className="muted mono" style={{ fontSize: 12, fontWeight: 400 }}>{fechaHora(n.at)}</div>
                  </div>
                  {!n.read && <span className="tag">Nueva</span>}
                </li>
              ))}
            </ul>
          ) : <p className="empty">No hay notificaciones en este filtro.</p>}
        </section>
      )}
    </>
  )
}
