import { useCallback, useEffect, useState } from 'react'
import { DEPARTAMENTOS, ROLES, TURNOS, api, hoy, iniciales } from './comun.js'
import Icono from './Icono.jsx'
import { Estado } from './ui.jsx'

const puntoVacio = () => ({ texto: '', avance: 0 })
const porcentaje = (v) => Math.min(100, Math.max(0, Math.round(Number(v) || 0)))

export default function RegistrarActividad({ user, recargar, avisar }) {
  const [equipo, setEquipo] = useState(null)
  const [para, setPara] = useState('')
  const [fecha, setFecha] = useState(hoy)
  const [turno, setTurno] = useState(user.shift)
  const [puntos, setPuntos] = useState([puntoVacio()])
  const [comentario, setComentario] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const cargarEquipo = useCallback(
    () => api(`/api/equipo/${user.no}`).then(setEquipo).catch((e) => setError(e.message)),
    [user.no],
  )
  useEffect(() => { cargarEquipo() }, [cargarEquipo])

  const emp = equipo?.find((e) => e.no === para)

  function elegir(no) {
    setPara(no)
    // El turno sugerido es el del empleado elegido
    const e = equipo.find((x) => x.no === no)
    if (e) setTurno(e.shift)
  }

  const cambiarPunto = (i, campo, valor) =>
    setPuntos(puntos.map((p, j) => (j === i ? { ...p, [campo]: valor } : p)))

  async function registrar(ev) {
    ev.preventDefault()
    const llenos = puntos.filter((p) => p.texto.trim())
    if (!para || !llenos.length) return setError('Selecciona un empleado y escribe al menos una actividad.')
    if (!fecha) return setError('Elige la fecha.')
    setError('')
    setEnviando(true)
    try {
      await api('/api/actividades', {
        method: 'POST',
        body: {
          por: user.no, para, fecha, turno, comentario,
          puntos: llenos.map((p) => ({ texto: p.texto.trim(), avance: porcentaje(p.avance) })),
        },
      })
      avisar(`Actividades registradas. Se notificó a ${emp.name}.`)
      setPara('')
      setPuntos([puntoVacio()])
      setComentario('')
      cargarEquipo()
      recargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Registrar actividades</h1>
        <p>Solo Ing. Full, Senior y Gerente pueden registrar y modificar.</p>
      </div>

      <div className="cols">
        <form className="card form-card" onSubmit={registrar} noValidate>
          <label className="field">
            <span>Empleado</span>
            <select value={para} onChange={(e) => elegir(e.target.value)} disabled={!equipo}>
              <option value="">{equipo ? 'Selecciona un empleado' : 'Cargando…'}</option>
              {equipo?.map((e) => <option key={e.no} value={e.no}>{e.name} — {ROLES[e.role]}</option>)}
            </select>
          </label>

          {emp && (
            <div className="emp-chip">
              <span className="avatar">{iniciales(emp.name)}</span>
              <div style={{ flex: 1 }}>
                <b>{emp.name}</b>
                <div className="muted" style={{ fontSize: 13 }}><span className="mono">No. {emp.no}</span> · {DEPARTAMENTOS[emp.dept]} · {ROLES[emp.role]}</div>
              </div>
              <span className="chip">Turno {emp.shift}</span>
            </div>
          )}

          <div className="grid2">
            <label className="field"><span>Fecha</span><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
            <label className="field">
              <span>Turno</span>
              <select value={turno} onChange={(e) => setTurno(e.target.value)}>
                {Object.entries(TURNOS).map(([k, v]) => <option key={k} value={k}>{k} · {v}</option>)}
              </select>
            </label>
          </div>

          <fieldset className="field">
            <legend>Actividades por puntos</legend>
            <div className="points">
              {puntos.map((p, i) => (
                <div className="point" key={i}>
                  <span className="num">{i + 1}.</span>
                  <input aria-label={`Actividad ${i + 1}`} placeholder="Describe la actividad" maxLength={200}
                    value={p.texto} onChange={(e) => cambiarPunto(i, 'texto', e.target.value)} />
                  <span className="pct-in">
                    <input type="number" min="0" max="100" step="5" aria-label={`Avance ${i + 1}`}
                      value={p.avance} onChange={(e) => cambiarPunto(i, 'avance', e.target.value)}
                      onBlur={(e) => cambiarPunto(i, 'avance', porcentaje(e.target.value))} />
                  </span>
                  <button type="button" className="iconbtn" aria-label={`Quitar ${i + 1}`} disabled={puntos.length < 2}
                    onClick={() => setPuntos(puntos.filter((_, j) => j !== i))}>
                    <Icono nombre="trash" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} disabled={puntos.length >= 20}
              onClick={() => setPuntos([...puntos, puntoVacio()])}>
              + Agregar punto
            </button>
          </fieldset>

          <label className="field">
            <span>Comentario del encargado</span>
            <textarea value={comentario} maxLength={500} placeholder="Ej. falta refacción, se termina en el siguiente turno"
              onChange={(e) => setComentario(e.target.value)} />
            <small>Úsalo si la actividad queda pendiente o incompleta.</small>
          </label>

          <p className="error" role="alert">{error}</p>
          <div className="row end">
            <button className="btn btn-primary" type="submit" disabled={enviando || !equipo}>
              <Icono nombre="bell" />{enviando ? 'Registrando…' : 'Registrar y notificar'}
            </button>
          </div>
        </form>
        {equipo && <Herencia user={user} equipo={equipo} alHeredar={() => { cargarEquipo(); recargar() }} avisar={avisar} />}
      </div>
    </>
  )
}

function Herencia({ user, equipo, alHeredar, avisar }) {
  const abiertas = equipo.flatMap((e) =>
    e.actividades.filter((a) => a.status === 'pending' || a.status === 'incomplete').map((a) => ({ ...a, nombre: e.name })))
  // Se hereda a un técnico o Ing. Jr del equipo
  const ejecutores = equipo.filter((e) => e.role === 'tec' || e.role === 'jr')

  return (
    <section className="card">
      <h2 className="card-title" style={{ marginBottom: 4 }}>Pendientes e incompletas</h2>
      <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
        Hereda la actividad al día siguiente o a otro técnico / Ing. Jr del siguiente turno.
      </p>
      {abiertas.length ? (
        <div className="inherit">
          {abiertas.map((a) => (
            <ItemHerencia key={a.id} a={a} user={user} ejecutores={ejecutores.filter((e) => e.no !== a.to)}
              alHeredar={alHeredar} avisar={avisar} />
          ))}
        </div>
      ) : <p className="empty">No hay actividades pendientes.</p>}
    </section>
  )
}

function ItemHerencia({ a, user, ejecutores, alHeredar, avisar }) {
  const [para, setPara] = useState(a.to)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function heredar() {
    setError('')
    setEnviando(true)
    try {
      await api(`/api/actividades/${a.id}/heredar`, { method: 'POST', body: { por: user.no, para } })
      avisar('Actividad heredada.')
      alHeredar()
    } catch (e) {
      setError(e.message)
      setEnviando(false)
    }
  }

  return (
    <div className="inherit-item">
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div>
          <b style={{ fontSize: 14 }}>{a.text}</b>
          <div className="muted" style={{ fontSize: 12 }}>{a.nombre} · <span className="mono">{a.date} · {a.shift}</span> · {a.pct}%</div>
        </div>
        <Estado estado={a.status} />
      </div>
      {a.mgr && <div className="mgr-note">{a.mgr}</div>}
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <select aria-label={`Heredar “${a.text}” a`} value={para} onChange={(e) => setPara(e.target.value)} className="select-sm">
          <option value={a.to}>Día siguiente (mismo empleado)</option>
          {ejecutores.map((e) => <option key={e.no} value={e.no}>Otro empleado · siguiente turno: {e.name}</option>)}
        </select>
        <button type="button" className="btn btn-secondary btn-sm" onClick={heredar} disabled={enviando}>Heredar</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  )
}
