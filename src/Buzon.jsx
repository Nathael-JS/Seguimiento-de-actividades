import { useState } from 'react'
import { api, grupoDia } from './comun.js'
import { ItemNotificacion } from './ui.jsx'
import { t } from './i18n.js'

// Filtro → tipos de notificación que incluye
const FILTROS = [
  ['Todas', null],
  ['Registradas', ['assigned', 'inherited', 'propia']],
  ['Realizadas', ['done']],
  ['Pendientes', ['pending']],
  ['Incompletas', ['incomplete']],
  ['Comentarios', ['comment']],
  ['Herencias', ['herencia-pendiente', 'herencia-aceptada', 'herencia-rechazada', 'herencia-redirigida', 'herencia-anulada']],
  ['Avisos', ['overdue', 'password', 'urgent-closed']],
]
const POR_PAGINA = 20

export default function Buzon({ user, datos, error, recargar }) {
  const [filtro, setFiltro] = useState(0)
  const [limite, setLimite] = useState(POR_PAGINA)
  const [errorAccion, setErrorAccion] = useState('')
  const tipos = FILTROS[filtro][1]
  const lista = datos?.notificaciones.filter((n) => !tipos || tipos.includes(n.kind)) ?? []

  // Hoy, Ayer, … en el orden en que llegan (de la más nueva a la más vieja)
  const grupos = []
  for (const n of lista.slice(0, limite)) {
    const dia = grupoDia(n.at)
    if (grupos.at(-1)?.[0] !== dia) grupos.push([dia, []])
    grupos.at(-1)[1].push(n)
  }

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
          <h1>{t('Buzón')}</h1>
          <p>{t('Toca una notificación para ir a la actividad. Se actualiza sola.')}</p>
        </div>
        <button className="btn btn-secondary" onClick={marcarLeidas}
          disabled={!datos?.notificaciones.some((n) => !n.read)}>
          {t('Marcar todo como leído')}
        </button>
      </div>

      <div className="chips" role="group" aria-label={t('Filtrar notificaciones')}>
        {FILTROS.map(([nombre], i) => (
          <button key={nombre} aria-pressed={filtro === i} onClick={() => { setFiltro(i); setLimite(POR_PAGINA) }}>{t(nombre)}</button>
        ))}
      </div>

      {(error || errorAccion) && <p className="error" role="alert">{error || errorAccion}</p>}
      {!datos ? !error && <p className="muted">{t('Cargando…')}</p> : (
        <section className="card">
          {grupos.length ? grupos.map(([dia, ns]) => (
            <div key={dia} className="grupo-dia">
              <h2>{dia}</h2>
              <ul className="list">
                {ns.map((n) => <ItemNotificacion key={n.id} n={n} user={user} recargar={recargar} avatar />)}
              </ul>
            </div>
          )) : <p className="empty">{t('No hay notificaciones en este filtro.')}</p>}
          {lista.length > limite && (
            <button className="btn btn-secondary btn-block" style={{ marginTop: 16 }} onClick={() => setLimite(limite + POR_PAGINA)}>
              {t('Cargar más ({n})', { n: lista.length - limite })}
            </button>
          )}
        </section>
      )}
    </>
  )
}
