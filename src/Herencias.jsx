import { useCallback, useEffect, useState } from 'react'
import { api, depto, fechaHora, hoy, nombreTurno, rol } from './comun.js'
import { Criticidad, Estado } from './ui.jsx'
import { t } from './i18n.js'

// Estado de una propuesta → [texto, clase del badge]
const ESTADO_HERENCIA = {
  pendiente: ['Esperando validación', 'badge-pending'],
  aceptada: ['Aceptada', 'badge-done'],
  redirigida: ['Redirigida', 'badge-progress'],
  rechazada: ['Rechazada', 'badge-incomplete'],
  anulada: ['Anulada', 'badge-anulada'],
}
const EstadoHerencia = ({ estado }) => <span className={`badge ${ESTADO_HERENCIA[estado][1]}`}>{t(ESTADO_HERENCIA[estado][0])}</span>
const persona = (p, conDepto) => `${p.name} · ${rol(p.role)} · ${nombreTurno(p.shift)}${conDepto ? ` · ${depto(p.dept)}` : ''}`

export default function Herencias({ user, recargar, avisar }) {
  const [equipo, setEquipo] = useState(null)
  const [bandeja, setBandeja] = useState(null)
  const [error, setError] = useState('')
  const [pestana, setPestana] = useState(null)

  const cargar = useCallback(
    () => Promise.all([api(`/api/equipo/${user.no}`), api(`/api/herencias/${user.no}?hoy=${hoy()}`)])
      .then(([e, b]) => { setEquipo(e); setBandeja(b) })
      .catch((e) => setError(e.message)),
    [user.no],
  )
  useEffect(() => { cargar() }, [cargar])
  const listo = () => { cargar(); recargar() }

  if (error) return <p className="error" role="alert">{error}</p>
  if (!bandeja || !equipo) return <p className="muted">{t('Cargando…')}</p>

  const heredables = equipo.flatMap((e) => e.actividades
    .filter((a) => (a.status === 'pending' || a.status === 'incomplete') && a.prioridad !== 'urgente')
    .map((a) => ({ ...a, nombre: e.name })))
  const { limite, usadas, porValidar, enviadas } = bandeja
  // Si hay algo que validar, se abre ahí: es lo que espera a otra persona
  const actual = pestana ?? (porValidar.length ? 'validar' : 'heredar')
  const PESTANAS = [['validar', 'Por validar', porValidar.length], ['heredar', 'Para heredar', heredables.length], ['enviadas', 'Enviadas', enviadas.length]]

  return (
    <>
      <div className="page-head">
        <h1>{t('Herencias')}</h1>
        <p>{t('Propón heredar una actividad con su motivo; la valida el encargado de quien la recibe. Las críticas pasan directo al turno siguiente una vez al día.')}</p>
      </div>

      <section className="card cupos" aria-label={t('Lo que te queda hoy')}>
        <h2>{t('Hoy')}</h2>
        <ul>
          {['A', 'B', 'C', 'D'].map((k) => <Cupo key={k} etiqueta={nombreTurno(k)} usadas={usadas.turnos[k]} limite={limite} />)}
          <Cupo etiqueta={t('A otro departamento')} usadas={usadas.cruzadas} limite={limite} />
          <Cupo etiqueta={t('Redirecciones')} usadas={usadas.redirecciones} limite={limite} />
        </ul>
      </section>

      <div className="tabs" role="tablist" aria-label={t('Herencias')}>
        {PESTANAS.map(([k, titulo, n]) => (
          <button key={k} role="tab" id={`tab-${k}`} aria-selected={actual === k} aria-controls="panel-herencias" onClick={() => setPestana(k)}>
            {t(titulo)} <span className={k === 'validar' && n ? 'count' : 'muted mono'} style={{ fontSize: 12 }}>{n}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel" id="panel-herencias" aria-labelledby={`tab-${actual}`}>
        {actual === 'validar' && (porValidar.length
          ? <div className="herencias">{porValidar.map((h) => (
            <PorValidar key={h.id} h={h} user={user} redirigir={usadas.redirecciones < limite} alResolver={listo} avisar={avisar} />
          ))}</div>
          : <section className="card empty">{t('No tienes herencias por validar.')}</section>)}

        {actual === 'heredar' && (heredables.length
          ? <div className="herencias">{heredables.map((a) => (
            <ParaHeredar key={a.id} a={a} user={user} bandeja={bandeja} alHeredar={listo} avisar={avisar} />
          ))}</div>
          : <section className="card empty">{t('Tu equipo no tiene actividades pendientes o incompletas.')}</section>)}

        {actual === 'enviadas' && (enviadas.length
          ? <section className="card herencias"><ul className="list enviadas">{enviadas.map((h) => <Enviada key={h.id} h={h} />)}</ul></section>
          : <section className="card empty">{t('Todavía no propones herencias.')}</section>)}
      </div>
    </>
  )
}

function Cupo({ etiqueta, usadas, limite }) {
  const lleno = usadas >= limite
  return (
    <li className={lleno ? 'lleno' : ''}>
      <span>{etiqueta}</span>
      <b className="mono">{usadas}/{limite}</b>
      <span className="pips" aria-hidden="true">{Array.from({ length: limite }, (_, i) => <i key={i} className={i < usadas ? 'on' : ''} />)}</span>
    </li>
  )
}

function Actividad({ a, children }) {
  return (
    <div className="row between" style={{ alignItems: 'flex-start', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <h3>{a.text}</h3>
        <div className="meta">{children}</div>
      </div>
      <div className="row" style={{ gap: 6, flex: 'none', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <Criticidad valor={a.criticidad} />
        <Estado estado={a.status} />
      </div>
    </div>
  )
}

function ParaHeredar({ a, user, bandeja, alHeredar, avisar }) {
  const [receptores, setReceptores] = useState(null)
  const [para, setPara] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const critica = a.criticidad === 'critica'
  const lleno = !critica && bandeja.usadas.turnos[a.shift] >= bandeja.limite
  const r = receptores?.find((x) => x.no === para)
  const cruzadaLlena = r && !critica && r.dept !== user.dept && bandeja.usadas.cruzadas >= bandeja.limite

  function abrir() {
    setReceptores([])
    api(`/api/actividades/${a.id}/receptores`).then(setReceptores).catch((e) => setError(e.message))
  }

  async function heredar(e) {
    e.preventDefault()
    if (!para || !motivo.trim()) return setError(t('Elige a quién y escribe el motivo.'))
    setError('')
    setEnviando(true)
    try {
      const h = await api(`/api/actividades/${a.id}/heredar`, { method: 'POST', body: { por: user.no, para, motivo: motivo.trim(), hoy: hoy() } })
      avisar(h.estado === 'aceptada'
        ? t('Actividad heredada a {nombre}.', { nombre: r.name })
        : t('Enviada a {nombre} para validar.', { nombre: h.validaName }))
      alHeredar()
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }

  const grupos = [
    [t('El mismo empleado, día siguiente'), (receptores ?? []).filter((x) => x.mismo)],
    [t('Tu departamento, turno siguiente'), (receptores ?? []).filter((x) => !x.mismo && x.dept === user.dept)],
    [t('Otros departamentos, turno siguiente'), (receptores ?? []).filter((x) => x.dept !== user.dept)],
  ].filter(([, lista]) => lista.length)

  return (
    <article className="card herencia">
      <Actividad a={a}>
        {a.nombre} · <span className="mono">{a.date} · {nombreTurno(a.shift)}</span>
      </Actividad>
      {a.mgr && <div className="mgr-note">{a.mgr}</div>}

      {a.herencia ? <p><EstadoHerencia estado="pendiente" /></p>
        : receptores === null ? (
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={abrir} disabled={lleno}>{t('Heredar…')}</button>
            {lleno && <small className="muted">{t('Ya usaste las 2 herencias de este turno hoy.')}</small>}
            {critica && <small className="muted">{t('Crítica: pasa directo, sin validación.')}</small>}
          </div>
        ) : (
          <form className="heredar-form" onSubmit={heredar} noValidate>
            <label className="field">
              <span>{t('Heredar a')}</span>
              <select value={para} onChange={(e) => setPara(e.target.value)}>
                <option value="">{t(receptores.length || error ? 'Elige a quién' : 'Cargando…')}</option>
                {grupos.map(([titulo, lista]) => (
                  <optgroup key={titulo} label={titulo}>
                    {lista.map((x) => <option key={x.no} value={x.no}>{persona(x, x.dept !== user.dept)}</option>)}
                  </optgroup>
                ))}
              </select>
              {r && <small>{r.valida ? t('La valida {nombre} antes de pasar.', { nombre: r.valida }) : t('Entra directo, sin validación.')}</small>}
            </label>
            <label className="field">
              <span>{t('Motivo')}</span>
              <textarea value={motivo} maxLength={300} placeholder={t('Ej. falta refacción; la línea para en este turno')} onChange={(e) => setMotivo(e.target.value)} />
            </label>
            {cruzadaLlena && <p className="error">{t('Ya usaste las 2 herencias a otro departamento hoy.')}</p>}
            <p className="error" role="alert">{error}</p>
            <div className="row end">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setReceptores(null); setError('') }}>{t('Cancelar')}</button>
              <button className="btn btn-primary btn-sm" type="submit" disabled={enviando || cruzadaLlena}>
                {t(enviando ? 'Enviando…' : r && !r.valida ? 'Heredar' : 'Enviar a validar')}
              </button>
            </div>
          </form>
        )}
    </article>
  )
}

function PorValidar({ h, user, redirigir, alResolver, avisar }) {
  const [modo, setModo] = useState(null) // null | 'rechazar' | 'redirigir'
  const [comentario, setComentario] = useState('')
  const [para, setPara] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function responder(accion) {
    if (accion !== 'aceptar' && !comentario.trim()) return setError(t('Escribe el motivo.'))
    if (accion === 'redirigir' && !para) return setError(t('Elige a quién redirigir.'))
    setError('')
    setEnviando(true)
    try {
      const r = await api(`/api/herencias/${h.id}/responder`, {
        method: 'POST',
        body: { por: user.no, accion, hoy: hoy(), ...(comentario.trim() && { comentario: comentario.trim() }), ...(accion === 'redirigir' && { para }) },
      })
      avisar(accion === 'aceptar' ? t('Herencia aceptada.') : accion === 'rechazar' ? t('Herencia rechazada.')
        : t('Herencia redirigida a {nombre}.', { nombre: r.redirigidaName }))
      alResolver()
    } catch (e) {
      setError(e.message)
      setEnviando(false)
    }
  }

  return (
    <article className="card herencia">
      <Actividad a={h.actividad}>
        {h.de.name} · {depto(h.de.dept)} · <span className="mono">{h.actividad.date} · {nombreTurno(h.actividad.shift)}</span>
      </Actividad>
      <dl className="ruta-herencia">
        <div><dt>{t('Para')}</dt><dd>{persona(h.paraPersona)}</dd></div>
        <div><dt>{t('Propone')}</dt><dd>{h.porName} · <span className="mono">{fechaHora(h.at)}</span></dd></div>
      </dl>
      <div className="mgr-note"><b>{t('Motivo')}:</b> {h.motivo}</div>

      {modo && (
        <div className="heredar-form">
          {modo === 'redirigir' && (
            <label className="field">
              <span>{t('Redirigir a')}</span>
              <select value={para} onChange={(e) => setPara(e.target.value)}>
                <option value="">{t('Elige a quién')}</option>
                {h.opciones.map((o) => <option key={o.no} value={o.no}>{persona(o)}</option>)}
              </select>
            </label>
          )}
          <label className="field">
            <span>{t(modo === 'rechazar' ? 'Por qué la rechazas' : 'Por qué la rediriges')}</span>
            <textarea value={comentario} maxLength={300} onChange={(e) => setComentario(e.target.value)} autoFocus />
          </label>
        </div>
      )}
      <p className="error" role="alert">{error}</p>
      {/* Un botón deshabilitado no recibe foco: la razón va a la vista, no solo en el title */}
      {!modo && (!redirigir || !h.opciones.length) && (
        <small className="muted">{t(!redirigir ? 'Ya redirigiste 2 actividades hoy.' : 'Nadie más de tu equipo puede recibirla.')}</small>
      )}
      <div className="row end" style={{ flexWrap: 'wrap' }}>
        {modo ? <>
          <button className="btn btn-ghost btn-sm" onClick={() => { setModo(null); setError('') }}>{t('Cancelar')}</button>
          <button className={`btn btn-sm ${modo === 'rechazar' ? 'btn-danger' : 'btn-primary'}`} disabled={enviando} onClick={() => responder(modo)}>
            {t(modo === 'rechazar' ? 'Rechazar' : 'Redirigir')}
          </button>
        </> : <>
          <button className="btn btn-ghost btn-sm" onClick={() => setModo('rechazar')}>{t('Rechazar')}</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setModo('redirigir')} disabled={!redirigir || !h.opciones.length}>
            {t('Redirigir')}
          </button>
          <button className="btn btn-primary btn-sm" disabled={enviando} onClick={() => responder('aceptar')}>{t('Aceptar')}</button>
        </>}
      </div>
    </article>
  )
}

function Enviada({ h }) {
  return (
    <li className="enviada">
      <div style={{ minWidth: 0 }}>
        <b>{h.actividad.text}</b>
        <div className="meta">
          → {h.paraPersona.name}{h.cruzada && ` · ${depto(h.paraPersona.dept)}`}
          {h.redirigidaName && <> → {h.redirigidaName}</>}
          {' · '}{h.estado === 'pendiente' ? t('la valida {nombre}', { nombre: h.validaName }) : <span className="mono">{fechaHora(h.resueltaAt ?? h.at)}</span>}
        </div>
        {h.respuesta && <div className="meta">“{h.respuesta}”</div>}
      </div>
      <div className="row" style={{ gap: 6, flex: 'none' }}>
        {h.critica && <span className="tag crit-critica">{t('Crítica')}</span>}
        <EstadoHerencia estado={h.estado} />
      </div>
    </li>
  )
}
