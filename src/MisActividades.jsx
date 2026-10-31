import { useCallback, useEffect, useState } from 'react'
import { ESTADOS, api } from './comun.js'
import { Anillo, Estado } from './ui.jsx'

export default function MisActividades({ user, recargar, avisar }) {
  const [tareas, setTareas] = useState(null)
  const [error, setError] = useState('')

  const cargar = useCallback(
    () => api(`/api/actividades/${user.no}`).then(setTareas).catch((e) => setError(e.message)),
    [user.no],
  )
  useEffect(() => { cargar() }, [cargar])

  function guardado() {
    avisar('Avance guardado y notificado a tu encargado.')
    cargar()
    recargar()
  }

  const promedio = tareas?.length ? Math.round(tareas.reduce((s, t) => s + t.pct, 0) / tareas.length) : 0

  return (
    <>
      <div className="page-head row between" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <h1>Tareas asignadas</h1>
          <p>Marca el estado, ajusta el avance y comenta tus actividades.</p>
        </div>
        {tareas && <div className="row"><Anillo pct={promedio} /><span className="muted" style={{ fontSize: 13 }}>Avance promedio</span></div>}
      </div>

      {error ? <p className="error" role="alert">{error}</p>
        : !tareas ? <p className="muted">Cargando…</p>
        : !tareas.length ? <section className="card empty">No tienes actividades asignadas.</section>
        : (
          <section className="card">
            {/* key con estado y avance: al recargar, el formulario se reinicia con lo guardado */}
            {tareas.map((t) => <Tarea key={`${t.id}-${t.status}-${t.pct}-${t.note}`} t={t} user={user} onGuardado={guardado} />)}
          </section>
        )}
    </>
  )
}

function Tarea({ t, user, onGuardado }) {
  const [estado, setEstado] = useState(t.status)
  const [avance, setAvance] = useState(t.pct)
  const [nota, setNota] = useState(t.note)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const cambio = estado !== t.status || avance !== t.pct || nota.trim() !== t.note

  function elegirEstado(e) {
    setEstado(e)
    if (e === 'done') setAvance(100)
  }

  async function guardar(ev) {
    ev.preventDefault()
    setError('')
    setGuardando(true)
    try {
      await api(`/api/actividades/${t.id}`, { method: 'PATCH', body: { por: user.no, estado, avance, nota } })
      onGuardado()
    } catch (e) {
      setError(e.message)
      setGuardando(false)
    }
  }

  return (
    <form className="task" onSubmit={guardar} noValidate>
      <div className="task-head">
        <div>
          <h3>{t.text}</h3>
          <div className="muted" style={{ fontSize: 13 }}>
            Asignada por {t.byName} · <span className="mono">{t.date} · Turno {t.shift} · {t.time}</span>
          </div>
        </div>
        <Estado estado={t.status} />
      </div>

      {t.mgr && <div className="mgr-note"><b>Comentario del encargado:</b> {t.mgr}</div>}

      <div className="status-seg" role="group" aria-label="Estado">
        {Object.entries(ESTADOS).map(([k, v]) => (
          <button key={k} type="button" data-s={k} aria-pressed={estado === k} onClick={() => elegirEstado(k)}>{v}</button>
        ))}
      </div>

      <div className="range">
        <label className="sr" htmlFor={`avance-${t.id}`}>Avance</label>
        <input id={`avance-${t.id}`} type="range" min="0" max="100" step="5" value={avance}
          disabled={estado === 'done'} onChange={(e) => setAvance(Number(e.target.value))} />
        <output htmlFor={`avance-${t.id}`}>{avance}%</output>
      </div>

      <label className="field">
        <span>Tu comentario</span>
        <textarea value={nota} maxLength={500} placeholder="Ej. falta refacción, se termina en el siguiente turno"
          onChange={(e) => setNota(e.target.value)} />
      </label>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="row end">
        <button className="btn btn-primary" type="submit" disabled={!cambio || guardando}>
          {guardando ? 'Guardando…' : 'Guardar avance'}
        </button>
      </div>
    </form>
  )
}
