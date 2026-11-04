import { useCallback, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { TURNOS, api, cierreTurno, columnaTablero as nombreColumna, dia, hoy, iniciales, rol } from './comun.js'
import Icono from './Icono.jsx'
import { Estado } from './ui.jsx'
import { t } from './i18n.js'

// Tablero por criticidad, semana a semana. Se arrastran las tarjetas o se usa el menú de cada una (teclado y táctil).
// - Encargado: crea las actividades de su equipo en Por clasificar, las mueve, fija y elimina, y valida las
//   solicitudes de cambio de su equipo.
// - Técnico / Ing. Jr: ve solo las suyas y agrega en Por clasificar; al moverlas pide el cambio a su encargado
const COLUMNAS = ['nueva', 'simple', 'normal', 'alta', 'critica', 'urgente']
const columnaDe = (a) => (a.prioridad === 'urgente' ? 'urgente' : a.criticidad ?? 'normal')

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
  const encargado = user.encargado

  // animar: las tarjetas recién creadas entran con la misma transición que al moverse
  const cargar = useCallback((animar) => (encargado
    ? api(`/api/equipo/${user.no}`).then((e) => { setEquipo(e); return e.flatMap((p) => p.actividades.map((a) => ({ ...a, persona: p }))) })
    : api(`/api/actividades/${user.no}`).then((l) => l.map((a) => ({ ...a, persona: user })))
  ).then((lista) => {
    if (animar) conTransicion(() => setActs(lista))
    else setActs(lista)
  }).catch((e) => setError(e.message)), [user, encargado])
  useEffect(() => { cargar(false) }, [cargar])

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
    const cuerpo = { columna, ...(urgente && { cierre }) }
    // Técnico / Ing. Jr: la tarjeta se queda y muestra la solicitud hasta que su encargado decida
    if (!encargado) return aplicar(a, { solicitud: { columna } }, cuerpo, t('Solicitud enviada a tu encargado: mover a {columna}.', { columna: nombreColumna(columna) }))
    const cambios = urgente ? { prioridad: 'urgente', criticidad: undefined } : { prioridad: undefined, criticidad: columna }
    aplicar(a, { ...cambios, solicitud: undefined }, cuerpo, t('Movida a {columna}.', { columna: nombreColumna(columna) }))
  }
  async function responder(a, aprobar) {
    try {
      const r = await api(`/api/actividades/${a.id}/solicitud`, { method: 'POST', body: { por: user.no, aprobar } })
      conTransicion(() => setActs((l) => l.map((x) => (x.id === a.id ? { ...r, persona: a.persona } : x))))
      avisar(t(aprobar ? 'Aprobada: se movió a {columna}.' : 'Solicitud rechazada; se avisó a {nombre}.', { columna: nombreColumna(a.solicitud.columna), nombre: a.persona.name.split(' ')[0] }))
      recargar()
    } catch (e) {
      avisar(e.message)
    }
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
  const porValidar = acts.filter((a) => a.solicitud)

  return (
    <>
      <div className="page-head">
        <h1>{t('Tablero')}</h1>
        <p>{encargado
          ? t('Crea las actividades de tu equipo en Por clasificar y arrástralas a su criticidad. Urgente se cierra al terminar su turno.')
          : t('Tus actividades por criticidad. Agrega en Por clasificar; al moverlas, tu encargado valida el cambio.')}</p>
      </div>

      {porValidar.length > 0 && (
        <p className={`notice${encargado ? ' warn' : ''}`} role="status" style={{ marginBottom: 16 }}>
          <Icono nombre="swap" />
          {encargado
            ? t(porValidar.length === 1 ? '{n} solicitud de cambio por validar: apruébala o recházala en su tarjeta.' : '{n} solicitudes de cambio por validar: apruébalas o recházalas en su tarjeta.', { n: porValidar.length })
            : t(porValidar.length === 1 ? '{n} solicitud esperando a tu encargado.' : '{n} solicitudes esperando a tu encargado.', { n: porValidar.length })}
        </p>
      )}

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
                {c === 'nueva' && (
                  <NuevasActividades equipo={equipo} semana={semana} user={user}
                    alCrear={(n) => {
                      cargar(true)
                      recargar()
                      avisar(encargado
                        ? t(n === 1 ? 'Actividad creada. Se notificó a quien la recibe.' : '{n} actividades creadas. Se notificó a quien las recibe.', { n })
                        : t(n === 1 ? 'Actividad agregada. Se avisó a tu encargado.' : '{n} actividades agregadas. Se avisó a tu encargado.', { n }))
                    }} />
                )}
              </header>
              <ul>
                {tarjetas.map((a) => <Tarjeta key={a.id} a={a} columna={c} encargado={encargado} mover={mover} fijar={fijar} eliminar={eliminar} responder={responder} />)}
              </ul>
              {!tarjetas.length && <p className="vacia">{t(c === 'nueva' ? 'Crea actividades con +; luego arrástralas a su criticidad.' : 'Arrastra una tarjeta aquí.')}</p>}
            </section>
          )
        })}
      </div>
    </>
  )
}

function Tarjeta({ a, columna, encargado, mover, fijar, eliminar, responder }) {
  const [confirmar, setConfirmar] = useState(false)
  const [arrastrando, setArrastrando] = useState(false)
  const cerrada = a.cerrada
  return (
    <li className={`tarjeta${a.status === 'done' ? ' hecha' : ''}${arrastrando ? ' arrastrando' : ''}${a.solicitud ? ' con-solicitud' : ''}`} style={{ viewTransitionName: `tarjeta-${a.id}` }}
      draggable={!cerrada} onDragEnd={() => setArrastrando(false)}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(a.id)); e.dataTransfer.effectAllowed = 'move'; setArrastrando(true) }}>
      <div className="tarjeta-cabeza">
        <b>{a.fijada && <span className="fija" title={t('Fijada')}><Icono nombre="pin" /><span className="sr">{t('Fijada')}: </span></span>}{a.text}</b>
        <details className="menu-tarjeta" onToggle={(e) => !e.currentTarget.open && setConfirmar(false)}>
          <summary aria-label={t('Opciones de “{actividad}”', { actividad: a.text })}><Icono nombre="dots" /></summary>
          <div className="menu-cuerpo">
            {!cerrada && <>
              <span className="meta">{t(encargado ? 'Mover a' : 'Pedir mover a')}</span>
              <div className="mover-a">
                {COLUMNAS.filter((c) => c !== columna).map((c) => (
                  <button key={c} type="button" className="chip-col" onClick={() => mover(a, c)}>{nombreColumna(c)}</button>
                ))}
              </div>
            </>}
            {encargado && <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => fijar(a)}>{t(a.fijada ? 'Desfijar' : 'Fijar arriba')}</button>
              {confirmar
                ? <button type="button" className="btn btn-danger btn-sm" onClick={() => eliminar(a)}>{t('Sí, eliminar')}</button>
                : <button type="button" className="btn btn-ghost btn-sm peligro" onClick={() => setConfirmar(true)}>{t('Eliminar')}</button>}
            </div>}
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
      {a.solicitud && (
        <div className="solicitud">
          <span><Icono nombre="swap" /> {t(encargado ? 'Pide mover a' : 'Pediste mover a')} <b>{nombreColumna(a.solicitud.columna)}</b></span>
          {encargado && (
            <span className="row" style={{ gap: 6 }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => responder(a, true)}>{t('Aprobar')}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => responder(a, false)}>{t('Rechazar')}</button>
            </span>
          )}
        </div>
      )}
    </li>
  )
}

// Panel Por clasificar: crea una o varias actividades (una por renglón); nacen sin criticidad y después se
// arrastran a la que les toca. El encargado elige para quién, fecha y turno; el técnico / Ing. Jr las agrega
// como tareas propias (hoy, su turno) y su encargado las clasifica
function NuevasActividades({ equipo, semana, user, alCrear }) {
  const encargado = user.encargado
  const [abierta, setAbierta] = useState(false)
  const [para, setPara] = useState('')
  const [texto, setTexto] = useState('')
  const [fecha, setFecha] = useState('')
  const [turno, setTurno] = useState('')
  const [comentario, setComentario] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const puntos = texto.split('\n').map((l) => l.trim()).filter(Boolean)

  function abrir() {
    const h = hoy()
    setFecha(h >= semana && h <= masDias(semana, 6) ? h : semana)
    setError('')
    setAbierta(true)
  }
  function elegir(no) {
    setPara(no)
    const e = equipo.find((x) => x.no === no)
    if (e) setTurno(e.shift) // el turno sugerido es el de la persona
  }
  async function crear(e) {
    e.preventDefault()
    if ((encargado && !para) || !puntos.length) return setError(t(encargado ? 'Elige a quién y escribe al menos una actividad.' : 'Escribe al menos una actividad.'))
    if (puntos.length > 20) return setError(t('Máximo 20 actividades a la vez.'))
    if (!encargado && puntos.some((p) => p.length > 200)) return setError(t('Cada actividad, máximo 200 caracteres.'))
    setEnviando(true)
    try {
      if (encargado) {
        await api('/api/actividades', {
          method: 'POST',
          body: { por: user.no, para, fecha, turno, comentario: comentario.trim(), prioridad: 'diaria', criticidad: 'nueva', puntos: puntos.map((p) => ({ texto: p })) },
        })
      } else {
        await api('/api/actividades/propia', { method: 'POST', body: { por: user.no, textos: puntos, prioridad: 'diaria', criticidad: 'nueva', hoy: hoy() } })
      }
      setAbierta(false)
      setTexto('')
      setComentario('')
      alCrear(puntos.length)
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  if (!abierta) return <button type="button" className="iconbtn mas-col" aria-label={t('Crear actividades')} title={t('Crear actividades')} onClick={abrir}>+</button>
  return (
    <form className="nueva-col" onSubmit={crear} noValidate>
      {encargado && (
        <select aria-label={t('Empleado')} value={para} onChange={(e) => elegir(e.target.value)} autoFocus>
          <option value="">{t('Selecciona un empleado')}</option>
          {equipo.map((p) => <option key={p.no} value={p.no}>{p.name} — {rol(p.role)}</option>)}
        </select>
      )}
      <textarea aria-label={t('Actividades, una por renglón')} placeholder={t('Una actividad por renglón')} rows={4} maxLength={4000}
        value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus={!encargado} />
      {!encargado && <p className="meta">{t('Para hoy, en tu turno. Tu encargado las clasifica.')}</p>}
      {encargado && <><div className="dos">
        <input type="date" aria-label={t('Fecha')} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <select aria-label={t('Turno')} value={turno} onChange={(e) => setTurno(e.target.value)} disabled={!para} title={TURNOS[turno]}>
          {Object.entries(TURNOS).map(([k, v]) => <option key={k} value={k} title={v}>{t('Turno')} {k}</option>)}
        </select>
      </div>
      <input aria-label={t('Comentario del encargado')} placeholder={t('Comentario (opcional)')} maxLength={500} value={comentario} onChange={(e) => setComentario(e.target.value)} /></>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row end" style={{ gap: 6 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAbierta(false)}>{t('Cancelar')}</button>
        <button className="btn btn-primary btn-sm" type="submit" disabled={enviando}>
          {t(puntos.length > 1 ? 'Crear {n}' : 'Crear', { n: puntos.length })}
        </button>
      </div>
    </form>
  )
}
