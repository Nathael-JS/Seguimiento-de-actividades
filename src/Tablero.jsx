import { useCallback, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { TURNOS, api, cierreTurno, criticidad, dia, hoy, iniciales, rol } from './comun.js'
import Icono from './Icono.jsx'
import { Estado } from './ui.jsx'
import { t } from './i18n.js'

// Tablero del encargado: las actividades de su equipo en columnas de criticidad (más Urgente), semana a semana.
// Mover una tarjeta de columna cambia su criticidad; se arrastra o se usa su menú (teclado y pantallas táctiles)
const COLUMNAS = ['simple', 'normal', 'alta', 'critica', 'urgente']
const columnaDe = (a) => (a.prioridad === 'urgente' ? 'urgente' : a.criticidad ?? 'normal')
const nombreColumna = (c) => (c === 'urgente' ? t('Urgente') : criticidad(c))

// Semanas de lunes a domingo, como AAAA-MM-DD locales
const local = (d) => d.toLocaleDateString('en-CA')
function lunesDe(fecha) {
  const d = new Date(`${fecha}T00:00`)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return local(d)
}
const masDias = (fecha, n) => { const d = new Date(`${fecha}T00:00`); d.setDate(d.getDate() + n); return local(d) }

// Las semanas que el encargado tiene a la vista se recuerdan en su navegador
const clave = (no) => `tablero-semanas-${no}`
function leerSemanas(no) {
  try { const s = JSON.parse(localStorage.getItem(clave(no))); if (Array.isArray(s) && s.length) return s } catch { /* sin almacenamiento */ }
  return [lunesDe(hoy())]
}
function guardarSemanas(no, semanas) {
  try { localStorage.setItem(clave(no), JSON.stringify(semanas)) } catch { /* solo esta vez */ }
}

// El cambio de columna se anima con View Transitions (cada tarjeta lleva su nombre); sin soporte o con
// "reducir movimiento", cambia sin animación
const reducido = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
function conTransicion(cambio) {
  if (!document.startViewTransition || reducido()) return cambio()
  document.startViewTransition(() => flushSync(cambio))
}

export default function Tablero({ user, recargar, avisar }) {
  const [equipo, setEquipo] = useState(null)
  const [acts, setActs] = useState(null)
  const [error, setError] = useState('')
  const [semanas, setSemanas] = useState(() => leerSemanas(user.no))
  const [semana, setSemana] = useState(() => (semanas.includes(lunesDe(hoy())) ? lunesDe(hoy()) : semanas[0]))
  const [nuevaSemana, setNuevaSemana] = useState('')
  const [encima, setEncima] = useState(null) // columna sobre la que se arrastra

  const cargar = useCallback(() => api(`/api/equipo/${user.no}`).then((e) => {
    setEquipo(e)
    setActs(e.flatMap((p) => p.actividades.map((a) => ({ ...a, persona: p }))))
  }).catch((e) => setError(e.message)), [user.no])
  useEffect(() => { cargar() }, [cargar])

  function cambiarSemanas(lista, elegir) {
    const orden = [...new Set(lista)].sort()
    setSemanas(orden)
    guardarSemanas(user.no, orden)
    if (elegir) setSemana(elegir)
  }
  function agregarSemana() {
    if (!nuevaSemana) return
    const l = lunesDe(nuevaSemana)
    cambiarSemanas([...semanas, l], l)
    setNuevaSemana('')
  }
  function quitarSemana(l) {
    const resto = semanas.filter((s) => s !== l)
    cambiarSemanas(resto.length ? resto : [lunesDe(hoy())], l === semana ? (resto[0] ?? lunesDe(hoy())) : undefined)
  }

  // Cambio optimista: se ve al instante y se revierte si el servidor lo rechaza
  async function aplicar(a, cambios, cuerpo, aviso) {
    const antes = acts
    conTransicion(() => setActs(acts.map((x) => (x.id === a.id ? { ...x, ...cambios } : x))))
    try {
      const r = await api(`/api/actividades/${a.id}/tablero`, { method: 'PATCH', body: { por: user.no, ...cuerpo } })
      setActs((l) => l.map((x) => (x.id === a.id ? { ...r, persona: a.persona } : x)))
      if (aviso) avisar(aviso)
    } catch (e) {
      conTransicion(() => setActs(antes))
      avisar(e.message)
    }
  }
  function mover(a, columna) {
    if (columnaDe(a) === columna) return
    const urgente = columna === 'urgente'
    const cierre = urgente ? cierreTurno(a.date, a.shift).toISOString() : undefined
    const cambios = urgente ? { prioridad: 'urgente', criticidad: undefined } : { prioridad: undefined, criticidad: columna }
    aplicar(a, cambios, { columna, ...(urgente && { cierre }) }, t('Movida a {columna}.', { columna: nombreColumna(columna) }))
  }
  const fijar = (a) => aplicar(a, { fijada: !a.fijada }, { fijada: !a.fijada })
  async function eliminar(a) {
    try {
      await api(`/api/actividades/${a.id}`, { method: 'DELETE', body: { por: user.no } })
      conTransicion(() => setActs((l) => l.filter((x) => x.id !== a.id)))
      avisar(t('Actividad eliminada.'))
      recargar()
    } catch (e) {
      avisar(e.message)
    }
  }

  if (error) return <p className="error" role="alert">{error}</p>
  if (!acts) return <p className="muted">{t('Cargando…')}</p>

  const domingo = masDias(semana, 6)
  const deLaSemana = acts.filter((a) => a.date >= semana && a.date <= domingo)
  // Fijadas arriba; luego las abiertas y al final las realizadas, por fecha
  const orden = (x, y) => (y.fijada === true) - (x.fijada === true) || (x.status === 'done') - (y.status === 'done') || x.date.localeCompare(y.date) || x.id - y.id

  return (
    <>
      <div className="page-head">
        <h1>{t('Tablero')}</h1>
        <p>{t('Las actividades de tu equipo por criticidad. Arrastra una tarjeta a otra columna para cambiarla; Urgente se cierra al terminar su turno.')}</p>
      </div>

      <div className="semanas" role="tablist" aria-label={t('Semanas')}>
        {semanas.map((l) => (
          <span key={l} className="semana">
            <button role="tab" aria-selected={l === semana} onClick={() => setSemana(l)}>
              {l === lunesDe(hoy()) ? t('Esta semana') : t('Semana del {dia}', { dia: dia(l) })}
            </button>
            {semanas.length > 1 && (
              <button className="quitar" aria-label={t('Quitar la semana del {dia}', { dia: dia(l) })} onClick={() => quitarSemana(l)}>×</button>
            )}
          </span>
        ))}
        <span className="agregar-semana">
          <label className="sr" htmlFor="nueva-semana">{t('Agregar semana')}</label>
          <input id="nueva-semana" type="date" value={nuevaSemana} onChange={(e) => setNuevaSemana(e.target.value)} />
          <button className="btn btn-ghost btn-sm" onClick={agregarSemana} disabled={!nuevaSemana}>+ {t('Semana')}</button>
        </span>
      </div>
      <p className="meta">{dia(semana)} – {dia(domingo)} · {t(deLaSemana.length === 1 ? '{n} actividad' : '{n} actividades', { n: deLaSemana.length })}</p>

      <div className="tablero">
        {COLUMNAS.map((c) => {
          const tarjetas = deLaSemana.filter((a) => columnaDe(a) === c).sort(orden)
          return (
            <section key={c} className={`columna col-${c}${encima === c ? ' encima' : ''}`} aria-labelledby={`col-${c}`}
              onDragOver={(e) => { e.preventDefault(); setEncima(c) }} onDragLeave={() => setEncima(null)}
              onDrop={(e) => {
                e.preventDefault()
                setEncima(null)
                const a = acts.find((x) => x.id === Number(e.dataTransfer.getData('text/plain')))
                if (a) mover(a, c)
              }}>
              <header>
                <h2 id={`col-${c}`}>{nombreColumna(c)} <span className="mono">{tarjetas.length}</span></h2>
                <NuevaEnColumna columna={c} equipo={equipo} semana={semana} user={user}
                  alCrear={() => { cargar(); recargar(); avisar(t('Actividad registrada. Se notificó a quien la recibe.')) }} />
              </header>
              <ul>
                {tarjetas.map((a) => <Tarjeta key={a.id} a={a} columna={c} mover={mover} fijar={fijar} eliminar={eliminar} />)}
              </ul>
              {!tarjetas.length && <p className="vacia">{t('Arrastra una tarjeta aquí o agrega una con +.')}</p>}
            </section>
          )
        })}
      </div>
    </>
  )
}

function Tarjeta({ a, columna, mover, fijar, eliminar }) {
  const [confirmar, setConfirmar] = useState(false)
  const cerrada = a.cerrada
  return (
    <li className={`tarjeta${a.status === 'done' ? ' hecha' : ''}`} style={{ viewTransitionName: `tarjeta-${a.id}` }}
      draggable={!cerrada} onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(a.id)); e.dataTransfer.effectAllowed = 'move' }}>
      <div className="tarjeta-cabeza">
        <b>{a.fijada && <span className="fija" title={t('Fijada')}><Icono nombre="pin" /><span className="sr">{t('Fijada')}: </span></span>}{a.text}</b>
        <details className="menu-tarjeta" onToggle={(e) => !e.currentTarget.open && setConfirmar(false)}>
          <summary aria-label={t('Opciones de “{actividad}”', { actividad: a.text })}><Icono nombre="dots" /></summary>
          <div className="menu-cuerpo">
            {!cerrada && <>
              <span className="meta">{t('Mover a')}</span>
              <div className="mover-a">
                {COLUMNAS.filter((c) => c !== columna).map((c) => (
                  <button key={c} type="button" className="chip-col" onClick={() => mover(a, c)}>{nombreColumna(c)}</button>
                ))}
              </div>
            </>}
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => fijar(a)}>{t(a.fijada ? 'Desfijar' : 'Fijar arriba')}</button>
              {confirmar
                ? <button type="button" className="btn btn-danger btn-sm" onClick={() => eliminar(a)}>{t('Sí, eliminar')}</button>
                : <button type="button" className="btn btn-ghost btn-sm peligro" onClick={() => setConfirmar(true)}>{t('Eliminar')}</button>}
            </div>
          </div>
        </details>
      </div>
      <div className="tarjeta-pie">
        <span className="persona"><span className="avatar">{iniciales(a.persona.name)}</span>{a.persona.name.split(' ')[0]}</span>
        <span className="meta mono">{dia(a.date)} · {a.shift}</span>
      </div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <Estado estado={a.status} />
        {cerrada && <span className="tag suave">{t('Cerrada con el turno')}</span>}
        {a.inh && <span className="tag">{t('Heredada')}</span>}
      </div>
    </li>
  )
}

// "+" de cada columna: registra una actividad con esa criticidad (o urgente) para alguien del equipo
function NuevaEnColumna({ columna, equipo, semana, user, alCrear }) {
  const [abierta, setAbierta] = useState(false)
  const [para, setPara] = useState('')
  const [texto, setTexto] = useState('')
  const [fecha, setFecha] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const emp = equipo.find((e) => e.no === para)

  function abrir() {
    const h = hoy()
    setFecha(h >= semana && h <= masDias(semana, 6) ? h : semana)
    setError('')
    setAbierta(true)
  }
  async function crear(e) {
    e.preventDefault()
    if (!para || !texto.trim()) return setError(t('Elige a quién y escribe la actividad.'))
    setEnviando(true)
    try {
      const urgente = columna === 'urgente'
      await api('/api/actividades', {
        method: 'POST',
        body: {
          por: user.no, para, fecha, turno: emp.shift, puntos: [{ texto: texto.trim() }],
          ...(urgente ? { prioridad: 'urgente', cierre: cierreTurno(fecha, emp.shift).toISOString() } : { prioridad: 'diaria', criticidad: columna }),
        },
      })
      setAbierta(false)
      setTexto('')
      alCrear()
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  if (!abierta) return <button type="button" className="iconbtn mas-col" aria-label={t('Agregar en {columna}', { columna: nombreColumna(columna) })} onClick={abrir}>+</button>
  return (
    <form className="nueva-col" onSubmit={crear} noValidate>
      <input aria-label={t('Actividad')} placeholder={t('Describe la actividad')} maxLength={200} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />
      <select aria-label={t('Empleado')} value={para} onChange={(e) => setPara(e.target.value)}>
        <option value="">{t('Selecciona un empleado')}</option>
        {equipo.map((p) => <option key={p.no} value={p.no}>{p.name} — {rol(p.role)} · {p.shift}</option>)}
      </select>
      <input type="date" aria-label={t('Fecha')} value={fecha} onChange={(e) => setFecha(e.target.value)} />
      {emp && <small className="meta">{t('Turno')} {emp.shift} · {TURNOS[emp.shift]}</small>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row end" style={{ gap: 6 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAbierta(false)}>{t('Cancelar')}</button>
        <button className="btn btn-primary btn-sm" type="submit" disabled={enviando}>{t('Agregar')}</button>
      </div>
    </form>
  )
}
