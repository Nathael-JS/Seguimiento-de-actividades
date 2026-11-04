import { useCallback, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { PERIODOS, TURNOS, api, cierreTurno, columnaTablero as nombreColumna, criticidad, dia, hoy, nombreTurno, rol } from './comun.js'
import Icono from './Icono.jsx'
import { Avatar, Estado } from './ui.jsx'
import { t } from './i18n.js'

// Tablero por criticidad, semana a semana. Se arrastran las tarjetas o se usa el menú de cada una (teclado y táctil).
// - Encargado: crea las actividades de su equipo en Por clasificar, las mueve, fija y elimina, y valida las
//   solicitudes de cambio de su equipo.
// - Técnico / Ing. Jr: ve solo las suyas y agrega en Por clasificar; al moverlas pide el cambio a su encargado
const COLUMNAS = ['nueva', 'simple', 'normal', 'alta', 'critica', 'urgente']
const NIVELES = ['simple', 'normal', 'alta', 'critica'] // criticidades de una tarea guardada
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
  const [guardadas, setGuardadas] = useState([])
  const [usar, setUsar] = useState(null) // tarea guardada elegida para crear: abre el panel Por clasificar con ella
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
  const cargarGuardadas = useCallback(() => api(`/api/guardadas/${user.no}`).then(setGuardadas).catch(() => {}), [user.no])
  useEffect(() => { cargarGuardadas() }, [cargarGuardadas])

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
  // Lanza el error para que el formulario de la tarjeta lo muestre
  async function editar(a, cambios) {
    const r = await api(`/api/actividades/${a.id}/editar`, { method: 'PATCH', body: { por: user.no, ...cambios } })
    conTransicion(() => setActs((l) => l.map((x) => (x.id === a.id ? { ...r, persona: a.persona } : x))))
    avisar(t('Cambios guardados.'))
  }
  async function guardarComo(a, nivel) {
    try {
      await api('/api/guardadas', { method: 'POST', body: { por: user.no, texto: a.text, criticidad: nivel, comentario: a.mgr ?? '', ...(a.recurrencia && { recurrencia: a.recurrencia }) } })
      avisar(t('Guardada en tus tareas como {nivel}.', { nivel: criticidad(nivel) }))
      cargarGuardadas()
    } catch (e) {
      avisar(e.message)
    }
  }
  async function quitarGuardada(g) {
    try {
      await api(`/api/guardadas/${g.id}`, { method: 'DELETE', body: { por: user.no } })
      setGuardadas((l) => l.filter((x) => x.id !== g.id))
    } catch (e) {
      avisar(e.message)
    }
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
      <Guardadas lista={guardadas} usar={(g) => setUsar({ g, n: Date.now() })} quitar={quitarGuardada} />

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
                  <NuevasActividades key={usar?.n ?? 0} inicial={usar?.g} guardadas={guardadas} equipo={equipo} semana={semana} user={user}
                    alCrear={(n) => {
                      setUsar(null)
                      cargar(true)
                      recargar()
                      avisar(encargado
                        ? t(n === 1 ? 'Actividad creada. Se notificó a quien la recibe.' : '{n} actividades creadas. Se notificó a quien las recibe.', { n })
                        : t(n === 1 ? 'Actividad agregada. Se avisó a tu encargado.' : '{n} actividades agregadas. Se avisó a tu encargado.', { n }))
                    }} />
                )}
              </header>
              <ul>
                {tarjetas.map((a) => <Tarjeta key={a.id} a={a} columna={c} encargado={encargado} mover={mover} fijar={fijar} eliminar={eliminar} responder={responder} editar={editar} guardarComo={guardarComo} />)}
              </ul>
              {!tarjetas.length && <p className="vacia">{t(c === 'nueva' ? 'Crea actividades con +; luego arrástralas a su criticidad.' : 'Arrastra una tarjeta aquí.')}</p>}
            </section>
          )
        })}
      </div>
    </>
  )
}

function Tarjeta({ a, columna, encargado, mover, fijar, eliminar, responder, editar, guardarComo }) {
  const [confirmar, setConfirmar] = useState(false)
  const [arrastrando, setArrastrando] = useState(false)
  const [editando, setEditando] = useState(false)
  const cerrada = a.cerrada
  // El técnico / Ing. Jr edita solo las que agregó él; el encargado, las de su equipo
  const puedeEditar = !cerrada && (encargado || a.propia)
  // Cierra el menú ⋯ al elegir una opción
  const cerrarMenu = (e) => { e.currentTarget.closest('details').open = false }
  if (editando) {
    return (
      <li className="tarjeta editando" style={{ viewTransitionName: `tarjeta-${a.id}` }}>
        <EditarTarjeta a={a} encargado={encargado} cancelar={() => setEditando(false)}
          guardar={async (cambios) => { await editar(a, cambios); setEditando(false) }} />
      </li>
    )
  }
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
            <span className="meta">{t('Guardar como tarea')}</span>
            <div className="mover-a">
              {NIVELES.map((c) => (
                <button key={c} type="button" className="chip-col" onClick={(e) => { cerrarMenu(e); guardarComo(a, c) }}>{criticidad(c)}</button>
              ))}
            </div>
            {puedeEditar && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }} onClick={(e) => { cerrarMenu(e); setEditando(true) }}>
                <Icono nombre="edit" />{t('Editar')}
              </button>
            )}
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
        <span className="persona"><Avatar no={a.persona.no} name={a.persona.name} />{a.persona.name.split(' ')[0]}</span>
        <span className="meta mono">{dia(a.date)} · {nombreTurno(a.shift)}</span>
      </div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <Estado estado={a.status} />
        {cerrada && <span className="tag suave">{t('Cerrada con el turno')}</span>}
        {a.inh && <span className="tag">{t('Heredada')}</span>}
        {a.recurrencia && <span className="tag suave repite"><Icono nombre="repeat" />{t(PERIODOS[a.recurrencia])}</span>}
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

// Interruptor "Repetir" y cada cuándo (vacío: no se repite)
function Repetir({ valor, cambiar }) {
  return (
    <div className="repetir">
      <label className="switch">
        <input type="checkbox" role="switch" checked={!!valor} onChange={(e) => cambiar(e.target.checked ? 'diaria' : '')} />
        <span>{t('Repetir')}</span>
      </label>
      {valor && (
        <select aria-label={t('Cada cuándo se repite')} value={valor} onChange={(e) => cambiar(e.target.value)}>
          {Object.entries(PERIODOS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
        </select>
      )}
    </div>
  )
}

// Editar una tarjeta: el encargado todo; el técnico / Ing. Jr, texto, fecha y recurrencia de las suyas
function EditarTarjeta({ a, encargado, guardar, cancelar }) {
  const [texto, setTexto] = useState(a.text)
  const [comentario, setComentario] = useState(a.mgr ?? '')
  const [fecha, setFecha] = useState(a.date)
  const [turno, setTurno] = useState(a.shift)
  const [repetir, setRepetir] = useState(a.recurrencia ?? '')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const urgente = a.prioridad === 'urgente' // es para un solo turno: no se repite

  async function enviar(e) {
    e.preventDefault()
    if (!texto.trim()) return setError(t('Escribe al menos una actividad.'))
    setEnviando(true)
    try {
      await guardar({ texto: texto.trim(), fecha, ...(encargado && { comentario, turno }), ...(!urgente && { recurrencia: repetir || 'no' }) })
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }
  return (
    <form className="nueva-col" onSubmit={enviar} noValidate>
      <textarea aria-label={t('Actividad')} rows={2} maxLength={200} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />
      {/* Uno debajo del otro: la tarjeta es angosta */}
      <input type="date" aria-label={t('Fecha')} value={fecha} onChange={(e) => setFecha(e.target.value)} />
      {encargado && (
        <select aria-label={t('Turno')} value={turno} onChange={(e) => setTurno(e.target.value)} title={TURNOS[turno]}>
          {Object.entries(TURNOS).map(([k, v]) => <option key={k} value={k} title={v}>{nombreTurno(k)}</option>)}
        </select>
      )}
      {encargado && <input aria-label={t('Comentario del encargado')} placeholder={t('Comentario (opcional)')} maxLength={500} value={comentario} onChange={(e) => setComentario(e.target.value)} />}
      {!urgente && <Repetir valor={repetir} cambiar={setRepetir} />}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row end" style={{ gap: 6 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={cancelar}>{t('Cancelar')}</button>
        <button className="btn btn-primary btn-sm" type="submit" disabled={enviando}>{t('Guardar')}</button>
      </div>
    </form>
  )
}

// Tareas guardadas: plantillas personales. "Usar" abre Por clasificar con ella
function Guardadas({ lista, usar, quitar }) {
  return (
    <details className="card guardadas">
      <summary>
        <Icono nombre="bookmark" />{t('Tareas guardadas')} <span className="mono">{lista.length}</span>
        <span className="flecha-abajo"><Icono nombre="abajo" /></span>
      </summary>
      {!lista.length ? <p className="meta">{t('Aún no tienes tareas guardadas. En el menú ⋯ de una tarjeta elige "Guardar como tarea".')}</p> : (
        <ul>
          {lista.map((g) => (
            <li key={g.id}>
              <span className="titulo">{g.texto}</span>
              <span className={`tag prio crit-${g.criticidad}`}>{criticidad(g.criticidad)}</span>
              {g.recurrencia && <span className="tag suave repite"><Icono nombre="repeat" />{t(PERIODOS[g.recurrencia])}</span>}
              <span className="row" style={{ gap: 4, marginLeft: 'auto' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => usar(g)}>{t('Usar')}</button>
                <button type="button" className="iconbtn" aria-label={t('Eliminar “{actividad}” de tus tareas guardadas', { actividad: g.texto })} onClick={() => quitar(g)}><Icono nombre="trash" /></button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

const fechaDeLaSemana = (semana) => { const h = hoy(); return h >= semana && h <= masDias(semana, 6) ? h : semana }

// Panel Por clasificar: crea una o varias actividades (una por renglón). El encargado elige para quién, fecha,
// turno y, si quiere, la criticidad (si no, nacen Por clasificar y después se arrastran); el técnico / Ing. Jr
// las agrega como tareas propias (hoy, su turno) y su encargado las clasifica. inicial: una tarea guardada
function NuevasActividades({ equipo, semana, user, guardadas, inicial, alCrear }) {
  const encargado = user.encargado
  const [abierta, setAbierta] = useState(!!inicial)
  const [para, setPara] = useState('')
  const [texto, setTexto] = useState(inicial?.texto ?? '')
  const [fecha, setFecha] = useState(() => fechaDeLaSemana(semana))
  const [turno, setTurno] = useState('')
  const [comentario, setComentario] = useState(inicial?.comentario ?? '')
  const [nivel, setNivel] = useState(inicial?.criticidad ?? 'nueva')
  const [repetir, setRepetir] = useState(inicial?.recurrencia ?? '')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const puntos = texto.split('\n').map((l) => l.trim()).filter(Boolean)

  function abrir() {
    setFecha(fechaDeLaSemana(semana))
    setError('')
    setAbierta(true)
  }
  function elegir(no) {
    setPara(no)
    const e = equipo.find((x) => x.no === no)
    if (e) setTurno(e.shift) // el turno sugerido es el de la persona
  }
  // Una tarea guardada se agrega como un renglón más y trae su criticidad, comentario y recurrencia
  function usarGuardada(id) {
    const g = guardadas.find((x) => x.id === Number(id))
    if (!g) return
    setTexto(texto.trim() ? `${texto.trimEnd()}\n${g.texto}` : g.texto)
    setNivel(g.criticidad)
    if (g.comentario) setComentario(g.comentario)
    if (g.recurrencia) setRepetir(g.recurrencia)
  }
  async function crear(e) {
    e.preventDefault()
    if ((encargado && !para) || !puntos.length) return setError(t(encargado ? 'Elige a quién y escribe al menos una actividad.' : 'Escribe al menos una actividad.'))
    if (puntos.length > 20) return setError(t('Máximo 20 actividades a la vez.'))
    if (puntos.some((p) => p.length > 200)) return setError(t('Cada actividad, máximo 200 caracteres.'))
    setEnviando(true)
    const comun = { por: user.no, prioridad: 'diaria', ...(repetir && { recurrencia: repetir }) }
    try {
      if (encargado) {
        await api('/api/actividades', {
          method: 'POST',
          body: { ...comun, para, fecha, turno, comentario: comentario.trim(), criticidad: nivel, puntos: puntos.map((p) => ({ texto: p })) },
        })
      } else {
        // Su encargado las clasifica: nacen Por clasificar aunque la tarea guardada tenga criticidad
        await api('/api/actividades/propia', { method: 'POST', body: { ...comun, textos: puntos, criticidad: 'nueva', hoy: hoy() } })
      }
      setAbierta(false)
      setTexto('')
      setComentario('')
      setNivel('nueva')
      setRepetir('')
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
      {guardadas.length > 0 && (
        <select aria-label={t('Usar una tarea guardada')} value="" onChange={(e) => usarGuardada(e.target.value)}>
          <option value="">{t('Usar una tarea guardada…')}</option>
          {guardadas.map((g) => <option key={g.id} value={g.id}>{g.texto} · {criticidad(g.criticidad)}</option>)}
        </select>
      )}
      {encargado && (
        <select aria-label={t('Empleado')} value={para} onChange={(e) => elegir(e.target.value)} autoFocus={!inicial}>
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
          {Object.entries(TURNOS).map(([k, v]) => <option key={k} value={k} title={v}>{nombreTurno(k)}</option>)}
        </select>
      </div>
      <select aria-label={t('Criticidad')} value={nivel} onChange={(e) => setNivel(e.target.value)}>
        {['nueva', ...NIVELES].map((c) => <option key={c} value={c}>{nombreColumna(c)}</option>)}
      </select>
      <input aria-label={t('Comentario del encargado')} placeholder={t('Comentario (opcional)')} maxLength={500} value={comentario} onChange={(e) => setComentario(e.target.value)} /></>}
      <Repetir valor={repetir} cambiar={setRepetir} />
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
