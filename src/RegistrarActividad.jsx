import { useCallback, useEffect, useState } from 'react'
import { TURNOS, api, cierreTurno, depto, dia, hora, hoy, iniciales, rol } from './comun.js'
import Icono from './Icono.jsx'
import { SelectorCriticidad } from './ui.jsx'
import { t } from './i18n.js'

const puntoVacio = () => ({ texto: '', avance: 0 })
const porcentaje = (v) => Math.min(100, Math.max(0, Math.round(Number(v) || 0)))

export default function RegistrarActividad({ user, recargar, avisar }) {
  const [equipo, setEquipo] = useState(null)
  const [para, setPara] = useState('')
  const [fecha, setFecha] = useState(hoy)
  const [turno, setTurno] = useState(user.shift)
  const [puntos, setPuntos] = useState([puntoVacio()])
  const [comentario, setComentario] = useState('')
  const [prioridad, setPrioridad] = useState('diaria')
  const [criticidad, setCriticidad] = useState('normal')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const cargarEquipo = useCallback(
    () => api(`/api/equipo/${user.no}`).then(setEquipo).catch((e) => setError(e.message)),
    [user.no],
  )
  useEffect(() => { cargarEquipo() }, [cargarEquipo])

  const emp = equipo?.find((e) => e.no === para)
  const cierre = fecha && cierreTurno(fecha, turno)

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
    if (!para || !llenos.length) return setError(t('Selecciona un empleado y escribe al menos una actividad.'))
    if (!fecha) return setError(t('Elige la fecha.'))
    setError('')
    setEnviando(true)
    try {
      await api('/api/actividades', {
        method: 'POST',
        body: {
          por: user.no, para, fecha, turno, comentario, prioridad,
          ...(prioridad === 'diaria' && { criticidad }),
          ...(prioridad === 'urgente' && { cierre: cierre.toISOString() }),
          puntos: llenos.map((p) => ({ texto: p.texto.trim(), avance: porcentaje(p.avance) })),
        },
      })
      avisar(t('Actividades registradas. Se notificó a {nombre}.', { nombre: emp.name }))
      setPara('')
      setPuntos([puntoVacio()])
      setComentario('')
      setPrioridad('diaria')
      setCriticidad('normal')
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
        <h1>{t('Registrar actividades')}</h1>
        <p>{t('Solo Ing. Full, Senior y Gerente pueden registrar y modificar.')} <a href="#herencias">{t('Las pendientes e incompletas se heredan en Herencias.')}</a></p>
      </div>

      <div className="registrar">
        <form className="card form-card" onSubmit={registrar} noValidate>
          <label className="field">
            <span>{t('Empleado')}</span>
            <select value={para} onChange={(e) => elegir(e.target.value)} disabled={!equipo}>
              <option value="">{t(equipo ? 'Selecciona un empleado' : 'Cargando…')}</option>
              {equipo?.map((e) => <option key={e.no} value={e.no}>{e.name} — {rol(e.role)}</option>)}
            </select>
          </label>

          {emp && (
            <div className="emp-chip">
              <span className="avatar">{iniciales(emp.name)}</span>
              <div style={{ flex: 1 }}>
                <b>{emp.name}</b>
                <div className="muted" style={{ fontSize: 13 }}><span className="mono">{t('No.')} {emp.no}</span> · {depto(emp.dept)} · {rol(emp.role)}</div>
              </div>
              <span className="chip">{t('Turno')} {emp.shift}</span>
            </div>
          )}

          <div className="grid2">
            <label className="field"><span>{t('Fecha')}</span><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
            <label className="field">
              <span>{t('Turno')}</span>
              <select value={turno} onChange={(e) => setTurno(e.target.value)}>
                {Object.entries(TURNOS).map(([k, v]) => <option key={k} value={k}>{k} · {v}</option>)}
              </select>
            </label>
          </div>

          {/* Diaria es el estándar; urgente es la excepción y se valida al cerrar el turno elegido */}
          <fieldset className="field">
            <legend>{t('Tipo')}</legend>
            <div className="tipo-tarea">
              <label>
                <input type="radio" name="prioridad-reg" checked={prioridad === 'diaria'} onChange={() => setPrioridad('diaria')} />
                <span><b>{t('Diaria')}</b><small>{t('Se registra como una actividad más del seguimiento.')}</small></span>
              </label>
              <label>
                <input type="radio" name="prioridad-reg" checked={prioridad === 'urgente'} onChange={() => setPrioridad('urgente')} />
                <span><b>{t('Urgente')}</b><small>{cierre ? t('Va primero y se cierra el {dia} a las {hora}, al terminar el turno {turno}. No se puede heredar.', { dia: dia(cierre.toLocaleDateString('en-CA')), hora: hora(cierre.toISOString()), turno }) : t('Elige la fecha.')}</small></span>
              </label>
            </div>
          </fieldset>

          {prioridad === 'diaria' && <SelectorCriticidad valor={criticidad} onChange={setCriticidad} />}

          <fieldset className="field">
            <legend>{t('Actividades por puntos')}</legend>
            <div className="points">
              {puntos.map((p, i) => (
                <div className="point" key={i}>
                  <span className="num">{i + 1}.</span>
                  <input aria-label={`${t('Actividad')} ${i + 1}`} placeholder={t('Describe la actividad')} maxLength={200}
                    value={p.texto} onChange={(e) => cambiarPunto(i, 'texto', e.target.value)} />
                  <span className="pct-in">
                    <input type="number" min="0" max="100" step="5" aria-label={`${t('Avance')} ${i + 1}`}
                      value={p.avance} onChange={(e) => cambiarPunto(i, 'avance', e.target.value)}
                      onBlur={(e) => cambiarPunto(i, 'avance', porcentaje(e.target.value))} />
                  </span>
                  <button type="button" className="iconbtn" aria-label={`${t('Quitar')} ${i + 1}`} disabled={puntos.length < 2}
                    onClick={() => setPuntos(puntos.filter((_, j) => j !== i))}>
                    <Icono nombre="trash" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} disabled={puntos.length >= 20}
              onClick={() => setPuntos([...puntos, puntoVacio()])}>
              + {t('Agregar punto')}
            </button>
          </fieldset>

          <label className="field">
            <span>{t('Comentario del encargado')}</span>
            <textarea value={comentario} maxLength={500} placeholder={t('Ej. falta refacción, se termina en el siguiente turno')}
              onChange={(e) => setComentario(e.target.value)} />
            <small>{t('Úsalo si la actividad queda pendiente o incompleta.')}</small>
          </label>

          <p className="error" role="alert">{error}</p>
          <div className="row end">
            <button className="btn btn-primary" type="submit" disabled={enviando || !equipo}>
              <Icono nombre="bell" />{t(enviando ? 'Registrando…' : 'Registrar y notificar')}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
