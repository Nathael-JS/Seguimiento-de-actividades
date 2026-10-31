import { useCallback, useEffect, useState } from 'react'
import { ESTADOS, api, estado as nombreEstado, hora, promedio } from './comun.js'
import { Anillo, Estado } from './ui.jsx'
import { t } from './i18n.js'

export default function MisActividades({ user, recargar, avisar }) {
  const [tareas, setTareas] = useState(null)
  const [error, setError] = useState('')

  const cargar = useCallback(
    () => api(`/api/actividades/${user.no}`).then(setTareas).catch((e) => setError(e.message)),
    [user.no],
  )
  useEffect(() => { cargar() }, [cargar])

  function guardado() {
    avisar(t('Avance guardado y notificado a tu encargado.'))
    cargar()
    recargar()
  }

  const avance = promedio(tareas ?? [])

  return (
    <>
      <div className="page-head row between" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <h1>{t('Tareas asignadas')}</h1>
          <p>{t('Marca el estado, ajusta el avance y comenta tus actividades.')}</p>
        </div>
        {tareas && <div className="row"><Anillo pct={avance} /><span className="muted" style={{ fontSize: 13 }}>{t('Avance promedio')}</span></div>}
      </div>

      {error ? <p className="error" role="alert">{error}</p>
        : !tareas ? <p className="muted">{t('Cargando…')}</p>
        : !tareas.length ? <section className="card empty">{t('No tienes actividades asignadas.')}</section>
        : (
          <section className="card">
            {/* key con estado y avance: al recargar, el formulario se reinicia con lo guardado */}
            {tareas.map((x) => <Tarea key={`${x.id}-${x.status}-${x.pct}-${x.note}`} tarea={x} user={user} onGuardado={guardado} />)}
          </section>
        )}
    </>
  )
}

function Tarea({ tarea, user, onGuardado }) {
  const [estado, setEstado] = useState(tarea.status)
  const [avance, setAvance] = useState(tarea.pct)
  const [nota, setNota] = useState(tarea.note)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const cambio = estado !== tarea.status || avance !== tarea.pct || nota.trim() !== tarea.note

  function elegirEstado(e) {
    setEstado(e)
    if (e === 'done') setAvance(100)
  }

  async function guardar(ev) {
    ev.preventDefault()
    setError('')
    setGuardando(true)
    try {
      await api(`/api/actividades/${tarea.id}`, { method: 'PATCH', body: { por: user.no, estado, avance, nota } })
      onGuardado()
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form className="task" onSubmit={guardar} noValidate>
      <div className="task-head">
        <div>
          <h3>{tarea.text}</h3>
          <div className="muted" style={{ fontSize: 13 }}>
            {t('Asignada por')} {tarea.byName} · <span className="mono">{tarea.date} · {t('Turno')} {tarea.shift} · {hora(tarea.at)}</span>
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {tarea.inh && <span className="tag">{t('Heredada')}</span>}
          <Estado estado={tarea.status} />
        </div>
      </div>

      {tarea.mgr && <div className="mgr-note"><b>{t('Comentario del encargado')}:</b> {tarea.mgr}</div>}

      <div className="status-seg" role="group" aria-label={t('Estado')}>
        {Object.keys(ESTADOS).map((k) => (
          <button key={k} type="button" data-s={k} aria-pressed={estado === k} onClick={() => elegirEstado(k)}>{nombreEstado(k)}</button>
        ))}
      </div>

      <div className="range">
        <label className="sr" htmlFor={`avance-${tarea.id}`}>{t('Avance')}</label>
        <input id={`avance-${tarea.id}`} type="range" min="0" max="100" step="5" value={avance}
          disabled={estado === 'done'} onChange={(e) => setAvance(Number(e.target.value))} />
        <output htmlFor={`avance-${tarea.id}`}>{avance}%</output>
      </div>

      <label className="field">
        <span>{t('Tu comentario')}</span>
        <textarea value={nota} maxLength={500} placeholder={t('Ej. falta refacción, se termina en el siguiente turno')}
          onChange={(e) => setNota(e.target.value)} />
      </label>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="row end">
        <button className="btn btn-primary" type="submit" disabled={!cambio || guardando}>
          {t(guardando ? 'Guardando…' : 'Guardar avance')}
        </button>
      </div>
    </form>
  )
}
