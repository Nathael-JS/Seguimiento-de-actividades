import { useCallback, useEffect, useRef, useState } from 'react'
import { api, esEncargado, lidera, nombreTurno, rol } from './comun.js'
import Icono from './Icono.jsx'
import { Avatar } from './ui.jsx'
import { t } from './i18n.js'

// Organigrama de la rama de quien consulta (de arriba abajo; en el celular, lista), armado con el campo boss de su
// equipo. El gerente lo reorganiza: arrastra a una persona sobre otro encargado (o usa "Mover a…", con teclado y en el
// celular) y puede revertir los movimientos de esta visita. Técnico sobre Ing. Jr (o al revés) lo deja como su
// ayudante. Al pasar sobre una persona se ve su ficha: encargado, líder, actividades y su gente
export default function Jerarquia({ user, avisar }) {
  const [equipo, setEquipo] = useState(null)
  const [error, setError] = useState('')
  const [arrastrado, setArrastrado] = useState(null) // persona que se está arrastrando
  const [moviendo, setMoviendo] = useState(null) // persona a la que se le eligió "Mover a…"
  const [historial, setHistorial] = useState([]) // movimientos de esta visita, el último al final: se revierten en orden
  const [plegados, setPlegados] = useState(() => new Set()) // ramas plegadas
  const plegar = (no) => setPlegados((s) => { const n = new Set(s); if (!n.delete(no)) n.add(no); return n })
  const gerente = user.role === 'gte'

  const cargar = useCallback(() => api(`/api/equipo/${user.no}`).then(setEquipo).catch((e) => setError(e.message)), [user.no])
  useEffect(() => { cargar() }, [cargar])

  if (error) return <p className="error" role="alert">{error}</p>
  if (!equipo) return <p className="muted">{t('Cargando…')}</p>

  const persona = (no) => (no === user.no ? user : equipo.find((e) => e.no === no))
  const hijos = (no) => equipo.filter((e) => e.boss === no && e.no !== no)
  // Toda la rama debajo de alguien (con visitados: un ciclo en los datos no la cuelga)
  const rama = (no, vistos = new Set([no])) => hijos(no).filter((e) => !vistos.has(e.no))
    .flatMap((e) => { vistos.add(e.no); return [e, ...rama(e.no, vistos)] })
  const liderDe = (no) => equipo.find((e) => e.ayudantes?.includes(no))
  // Dónde se puede soltar a alguien: no en sí mismo ni en su rama; técnico ↔ Ing. Jr = ayudante (no uno del otro); si no, la regla de puesto
  const puedeSoltar = (p, destino) => p && destino && p.no !== destino.no && p.boss !== destino.no &&
    !rama(p.no).some((e) => e.no === destino.no) &&
    ((p.role === 'tec' || p.role === 'jr') && (destino.role === 'tec' || destino.role === 'jr') ? !destino.ayudantes?.includes(p.no) && !p.ayudantes?.includes(destino.no) : lidera(destino.role, p.role))

  async function mover(p, destino) {
    setArrastrado(null)
    setMoviendo(null)
    try {
      const r = await api(`/api/jerarquia/${p.no}`, { method: 'PATCH', body: { por: user.no, a: destino.no } })
      setHistorial((h) => [...h, r.ayudanteDe ? { p, lider: destino } : { p, antes: p.boss, despues: destino }])
      avisar(r.ayudanteDe
        ? t('{nombre} ahora es ayudante de {lider}.', { nombre: p.name.split(' ')[0], lider: destino.name.split(' ')[0] })
        : t('{nombre} ahora reporta a {lider}.', { nombre: p.name.split(' ')[0], lider: destino.no === user.no ? t('ti') : destino.name.split(' ')[0] }))
      cargar()
    } catch (e) {
      avisar(e.message)
    }
  }
  // Revertir el último movimiento: de vuelta con su encargado anterior, o fuera de los ayudantes de quien lo recibió
  async function revertir() {
    const m = historial.at(-1)
    try {
      if (m.lider) {
        const lider = persona(m.lider.no)
        await api(`/api/lideres/${lider.no}/ayudantes`, { method: 'PUT', body: { por: user.no, ayudantes: (lider.ayudantes ?? []).filter((x) => x !== m.p.no) } })
      } else {
        await api(`/api/jerarquia/${m.p.no}`, { method: 'PATCH', body: { por: user.no, a: m.antes } })
      }
      setHistorial((h) => h.slice(0, -1))
      avisar(t('Movimiento revertido: {nombre} volvió a su lugar.', { nombre: m.p.name.split(' ')[0] }))
      cargar()
    } catch (e) {
      avisar(e.message)
    }
  }
  const ctx = { user, gerente, arrastrado, setArrastrado, puedeSoltar, mover, hijos, rama, persona, liderDe, setMoviendo, plegados, plegar }
  const ultimo = historial.at(-1)
  // La raíz (quien consulta) con sus ayudantes: el gerente viene en su lista; a un Full o Senior se le reconocen porque
  // su encargado no está en el árbol
  const propio = equipo.find((e) => e.no === user.no)
  const sueltos = equipo.filter((e) => e.no !== user.no && e.boss !== user.no && !equipo.some((x) => x.no === e.boss)).map((e) => e.no)
  const raiz = { ...user, ...propio, ayudantes: [...new Set([...(propio?.ayudantes ?? []), ...sueltos])] }

  return (
    <>
      <div className="page-head">
        <h1>{t('Jerarquía')}</h1>
        <p>{gerente
          ? t('Quién reporta a quién. Arrastra a una persona sobre su nuevo encargado (o usa Mover a…); un técnico sobre un Ing. Jr queda como su ayudante.')
          : t('Quién reporta a quién en tu equipo. Toca una rama para plegarla; abre a una persona para ver sus actividades.')}</p>
      </div>
      {ultimo && (
        <div className="notice revertir" role="status">
          <Icono nombre="swap" />
          <span>
            {ultimo.lider
              ? t('Último cambio: {nombre} quedó como ayudante de {lider}.', { nombre: ultimo.p.name, lider: ultimo.lider.name })
              : t('Último cambio: {nombre} pasó a reportar a {lider}.', { nombre: ultimo.p.name, lider: ultimo.despues.no === user.no ? t('ti') : ultimo.despues.name })}
            {historial.length > 1 && <span className="muted"> · {t('{n} cambios en esta visita', { n: historial.length })}</span>}
          </span>
          <button className="btn btn-secondary btn-sm" onClick={revertir}>{t('Revertir')}</button>
        </div>
      )}
      <section className={`card organigrama-marco${arrastrado ? ' arrastrando-arbol' : ''}`}>
        <ul className="arbol organigrama"><Rama p={raiz} ctx={ctx} /></ul>
      </section>
      {moviendo && <MoverA p={moviendo} destinos={[user, ...equipo.filter((e) => e.no !== user.no)].filter((d) => puedeSoltar(moviendo, d))}
        mover={mover} cerrar={() => setMoviendo(null)} />}
    </>
  )
}

function Rama({ p, ctx }) {
  const directos = ctx.hijos(p.no)
  const ayudantes = (p.ayudantes ?? []).map(ctx.persona).filter(Boolean)
  const plegada = ctx.plegados.has(p.no)
  return (
    <li>
      <Nodo p={p} ctx={ctx} directos={directos.length} total={ctx.rama(p.no).length} plegada={plegada} />
      {!plegada && (directos.length > 0 || ayudantes.length > 0) && (
        <ul>
          {directos.map((e) => <Rama key={e.no} p={e} ctx={ctx} />)}
          {/* Sus ayudantes: reportan a otro encargado; aquí solo se muestran (se mueven desde su lugar) */}
          {ayudantes.map((a) => <li key={`ayudante-${a.no}`} className="ayudante"><Nodo p={a} ctx={ctx} ayudante /></li>)}
        </ul>
      )}
    </li>
  )
}

function Nodo({ p, ctx, directos = 0, total = 0, ayudante = false, plegada = false }) {
  const { user, gerente, arrastrado, setArrastrado, puedeSoltar, mover } = ctx
  const [encima, setEncima] = useState(false)
  const yo = p.no === user.no
  const movible = gerente && !yo && !ayudante
  const valido = arrastrado && puedeSoltar(arrastrado, p)
  // A los líderes se les ve con su equipo en Monitoreo; a los demás, con sus actividades
  const destino = `#monitoreo?${esEncargado(p.role) ? 'lider' : 'empleado'}=${p.no}`
  const clases = ['nodo', arrastrado?.no === p.no && 'arrastrado', arrastrado && !ayudante && (valido ? 'destino-ok' : 'destino-no'), encima && valido && 'encima']
  return (
    <span className={clases.filter(Boolean).join(' ')} data-rol={p.role} tabIndex={-1}
      draggable={movible} onDragStart={(e) => { e.dataTransfer.setData('text/plain', p.no); e.dataTransfer.effectAllowed = 'move'; setArrastrado(p) }}
      onDragEnd={() => setArrastrado(null)}
      onDragOver={(e) => { if (valido && !ayudante) { e.preventDefault(); setEncima(true) } }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => { e.preventDefault(); setEncima(false); if (valido) mover(arrastrado, p) }}>
      {movible && <span className="asa" aria-hidden="true"><Icono nombre="dots" /></span>}
      <Avatar no={p.no} name={p.name} />
      <span className="nodo-txt">
        {yo ? <b>{p.name} <span className="muted">({t('tú')})</span></b> : <a href={destino}><b>{p.name}</b></a>}
        <small>{rol(p.role)} · <span className="mono">{p.no}</span> · {nombreTurno(p.shift)}</small>
      </span>
      {ayudante && <span className="chip ayudante-chip">{t('Ayudante')}</span>}
      {directos > 0 && (
        // Pliega o despliega su rama
        <button type="button" className="chip chip-rama" aria-expanded={!plegada} title={t('{n} en total', { n: total })} onClick={() => ctx.plegar(p.no)}>
          {t(directos === 1 ? '{n} directo' : '{n} directos', { n: directos })}<Icono nombre="abajo" />
        </button>
      )}
      {movible && (
        <button type="button" className="iconbtn mover-a-btn" aria-label={t('Mover a {nombre} a…', { nombre: p.name })} title={t('Mover a…')}
          onClick={() => ctx.setMoviendo(p)}>
          <Icono nombre="swap" />
        </button>
      )}
      {!yo && <Ficha p={p} ctx={ctx} />}
    </span>
  )
}

// Ficha al pasar el cursor (o con el foco): con quién está cargado, su líder si es ayudante, sus actividades y su gente
function Ficha({ p, ctx }) {
  const jefe = ctx.persona(p.boss)
  const lider = ctx.liderDe(p.no)
  const acts = p.actividades ?? []
  const abiertas = acts.filter((a) => a.status !== 'done').length
  return (
    <span className="nodo-ficha" role="tooltip">
      <span><span className="muted">{t('Encargado directo')}</span> {jefe ? `${jefe.no === ctx.user.no ? t('Tú') : jefe.name} · ${rol(jefe.role)}` : '—'}</span>
      {lider && <span><span className="muted">{t('Líder (como ayudante)')}</span> {lider.name} · {rol(lider.role)}</span>}
      <span><span className="muted">{t('Actividades')}</span> {t('{n} abiertas · {m} realizadas', { n: abiertas, m: acts.length - abiertas })}</span>
      {(p.ayudantes?.length ?? 0) > 0 && <span><span className="muted">{t('Ayudantes')}</span> {p.ayudantes.length}</span>}
    </span>
  )
}

// "Mover a…": la misma reorganización sin arrastrar (teclado, celular). Solo destinos válidos
function MoverA({ p, destinos, mover, cerrar }) {
  const ref = useRef(null)
  const [destino, setDestino] = useState(destinos[0]?.no ?? '')
  useEffect(() => { ref.current.showModal() }, [])
  return (
    <dialog ref={ref} className="card modal" aria-labelledby="mover-titulo" onClose={cerrar}>
      <form style={{ display: 'contents' }} onSubmit={(e) => { e.preventDefault(); const d = destinos.find((x) => x.no === destino); if (d) mover(p, d) }}>
        <h2 id="mover-titulo" className="card-title" style={{ margin: 0 }}>{t('Mover a {nombre}', { nombre: p.name })}</h2>
        {destinos.length ? (
          <label className="field"><span>{t('Nuevo encargado o líder')}</span>
            <select value={destino} onChange={(e) => setDestino(e.target.value)} autoFocus>
              {destinos.map((d) => (
                <option key={d.no} value={d.no}>
                  {d.name} · {rol(d.role)}{(d.role === 'tec' || d.role === 'jr') ? ` (${t('como ayudante')})` : ''}
                </option>
              ))}
            </select>
          </label>
        ) : <p className="muted">{t('No hay a dónde moverlo: nadie de tu equipo puede tenerlo a su cargo.')}</p>}
        <div className="row end">
          <button type="button" className="btn btn-ghost" onClick={() => ref.current.close()}>{t('Cancelar')}</button>
          <button className="btn btn-primary" disabled={!destinos.length}>{t('Mover')}</button>
        </div>
      </form>
    </dialog>
  )
}
