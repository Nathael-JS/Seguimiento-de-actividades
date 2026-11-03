import { useCallback, useEffect, useState } from 'react'
import { ESTADOS, api, depto, estado as nombreEstado, finTurno, hora, hoy, iniciales, promedio, rol } from './comun.js'
import { Anillo, Campo, Criticidad, Estado, SelectorCriticidad } from './ui.jsx'
import { t } from './i18n.js'

export default function MisActividades({ user, recargar, avisar }) {
  const [tareas, setTareas] = useState(null)
  const [error, setError] = useState('')
  const [nueva, setNueva] = useState(false)
  // Solo técnicos e Ing. Jr agregan tareas propias
  const puedeAgregar = user.role === 'tec' || user.role === 'jr'

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

  function creada() {
    setNueva(false)
    avisar(t('Tarea agregada. Se avisó a tu encargado.'))
    cargar()
    recargar()
  }

  return (
    <>
      <div className="page-head row between" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <h1>{t('Tareas asignadas')}</h1>
          <p>{t('Marca el estado, ajusta el avance y comenta tus actividades.')}</p>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {tareas && <><Anillo pct={avance} /><span className="meta">{t('Avance promedio')}</span></>}
          {puedeAgregar && !nueva && <button className="btn btn-primary" onClick={() => setNueva(true)}>+ {t('Nueva tarea')}</button>}
        </div>
      </div>

      {nueva && <NuevaTarea user={user} alCrear={creada} cancelar={() => setNueva(false)} />}

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
  // Una realizada ya no se trabaja: se muestra plegada y se abre solo para corregirla
  const [abierta, setAbierta] = useState(tarea.status !== 'done')
  const urgenteAbierta = tarea.prioridad === 'urgente' && !tarea.cerrada && tarea.status !== 'done'

  // Realizada es 100 % y 100 % es Realizada, igual que en el servidor
  function elegirEstado(e) {
    setEstado(e)
    if (e === 'done') setAvance(100)
  }
  function elegirAvance(v) {
    setAvance(v)
    if (v === 100) setEstado('done')
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
          <div className="meta">
            {tarea.propia ? t('Registrada por ti') : `${t('Asignada por')} ${tarea.byName}`} · <span className="mono">{tarea.date} · {t('Turno')} {tarea.shift} · {hora(tarea.at)}</span>
            {urgenteAbierta && <> · <b className="txt-incompleta">{t('Cierra a las {hora}', { hora: hora(tarea.cierreTurno) })}</b></>}
          </div>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {tarea.prioridad === 'urgente' && <span className="tag urgente">{t('Urgente')}</span>}
          <Criticidad valor={tarea.criticidad} />
          {tarea.cerrada && <span className="tag suave">{t('Cerrada con el turno')}</span>}
          {tarea.inh && <span className="tag">{t('Heredada')}</span>}
          <Estado estado={tarea.status} />
        </div>
      </div>

      {tarea.mgr && <div className="mgr-note"><b>{t('Comentario del encargado')}:</b> {tarea.mgr}</div>}

      {/* Validada al cerrar el turno: queda en su estado, solo se muestra */}
      {!tarea.cerrada && !abierta ? (
        <div className="row between plegada">
          <span className="meta">{t('Terminada al {pct}%', { pct: tarea.pct })}{tarea.note && <> · “{tarea.note}”</>}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAbierta(true)}>{t('Editar')}</button>
        </div>
      ) : tarea.cerrada ? (
        <p className="muted" style={{ fontSize: 14 }}>
          {t('Se cerró al terminar el turno con {pct}%: ya no se puede cambiar ni heredar.', { pct: tarea.pct })}
          {tarea.note && <> {t('Tu comentario')}: “{tarea.note}”</>}
        </p>
      ) : <>
      <div className="status-seg" role="group" aria-label={t('Estado')}>
        {Object.keys(ESTADOS).map((k) => (
          <button key={k} type="button" data-s={k} aria-pressed={estado === k} onClick={() => elegirEstado(k)}>{nombreEstado(k)}</button>
        ))}
      </div>

      <div className="range">
        <label className="sr" htmlFor={`avance-${tarea.id}`}>{t('Avance')}</label>
        <input id={`avance-${tarea.id}`} type="range" min="0" max="100" step="5" value={avance}
          disabled={estado === 'done'} onChange={(e) => elegirAvance(Number(e.target.value))} />
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
      </>}
    </form>
  )
}

// Nueva tarea del propio técnico / Ing. Jr: sus datos van tal cual, solo se agrega la tarea
function NuevaTarea({ user, alCrear, cancelar }) {
  const [texto, setTexto] = useState('')
  const [prioridad, setPrioridad] = useState('diaria')
  const [criticidad, setCriticidad] = useState('normal')
  const [avance, setAvance] = useState(0)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const cierre = finTurno(user.shift)

  async function agregar(e) {
    e.preventDefault()
    if (!texto.trim()) return setError(t('Describe la tarea.'))
    setError('')
    setEnviando(true)
    try {
      await api('/api/actividades/propia', {
        method: 'POST',
        body: {
          por: user.no, texto: texto.trim(), prioridad, avance, hoy: hoy(),
          ...(prioridad === 'urgente' ? { cierre: cierre.toISOString() } : { criticidad }),
        },
      })
      alCrear()
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }

  return (
    <form className="card form-card" onSubmit={agregar} noValidate>
      <h2 className="card-title" style={{ margin: 0 }}>{t('Nueva tarea')}</h2>
      <div className="emp-chip" aria-label={t('Se registra con tus datos')}>
        <span className="avatar">{iniciales(user.name)}</span>
        <div style={{ flex: 1 }}>
          <b>{user.name}</b>
          <div className="meta"><span className="mono">{t('No.')} {user.no}</span> · {depto(user.dept)} · {rol(user.role)}</div>
        </div>
        <span className="chip">{t('Turno')} {user.shift} · {hoy()}</span>
      </div>
      <Campo label={t('Tarea')} id="tarea" maxLength={200} placeholder={t('Describe la tarea')} value={texto}
        onChange={(e) => setTexto(e.target.value)} autoFocus />
      <fieldset className="field">
        <legend>{t('Tipo')}</legend>
        <div className="tipo-tarea">
          <label>
            <input type="radio" name="prioridad" checked={prioridad === 'diaria'} onChange={() => setPrioridad('diaria')} />
            <span><b>{t('Diaria')}</b><small>{t('Se registra como una actividad más del seguimiento.')}</small></span>
          </label>
          <label>
            <input type="radio" name="prioridad" checked={prioridad === 'urgente'} onChange={() => setPrioridad('urgente')} />
            <span><b>{t('Urgente')}</b><small>{t('Va primero y debe completarse antes de las {hora}, cuando cierra tu turno. No se puede heredar.', { hora: hora(cierre.toISOString()) })}</small></span>
          </label>
        </div>
      </fieldset>
      {prioridad === 'diaria' && <SelectorCriticidad valor={criticidad} onChange={setCriticidad} />}
      <div className="field">
        <label htmlFor="avance-nueva">{t('Avance')} <small>{t('100 % = completada')}</small></label>
        <div className="range">
          <input id="avance-nueva" type="range" min="0" max="100" step="5" value={avance} onChange={(e) => setAvance(Number(e.target.value))} />
          <output htmlFor="avance-nueva">{avance}%</output>
        </div>
      </div>
      <p className="error" role="alert">{error}</p>
      <div className="row end">
        <button type="button" className="btn btn-ghost" onClick={cancelar}>{t('Cancelar')}</button>
        <button className="btn btn-primary" type="submit" disabled={enviando}>{t(enviando ? 'Guardando…' : 'Agregar tarea')}</button>
      </div>
    </form>
  )
}
