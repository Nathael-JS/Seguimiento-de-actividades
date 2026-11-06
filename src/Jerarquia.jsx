import { useCallback, useEffect, useRef, useState } from 'react'
import { api, esEncargado, lidera, nombreTurno, rol } from './comun.js'
import Icono from './Icono.jsx'
import { Avatar } from './ui.jsx'
import { t } from './i18n.js'

// Árbol de la rama de quien consulta, armado con el campo boss de su equipo. El gerente lo reorganiza: arrastra a una
// persona sobre otro encargado (o usa "Mover a…", con teclado y en el celular). Técnico sobre Ing. Jr (o al revés)
// lo deja como su ayudante. Al pasar sobre una persona se ve su ficha: encargado, líder, actividades y su gente
export default function Jerarquia({ user, avisar }) {
  const [equipo, setEquipo] = useState(null)
  const [error, setError] = useState('')
  const [arrastrado, setArrastrado] = useState(null) // persona que se está arrastrando
  const [moviendo, setMoviendo] = useState(null) // persona a la que se le eligió "Mover a…"
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
  // Dónde se puede soltar a alguien: no en sí mismo ni en su rama; técnico ↔ Ing. Jr = ayudante; si no, la regla de puesto
  const puedeSoltar = (p, destino) => p && destino && p.no !== destino.no && p.boss !== destino.no &&
    !rama(p.no).some((e) => e.no === destino.no) &&
    ((p.role === 'tec' || p.role === 'jr') && (destino.role === 'tec' || destino.role === 'jr') ? !destino.ayudantes?.includes(p.no) : lidera(destino.role, p.role))

  async function mover(p, destino) {
    setArrastrado(null)
    setMoviendo(null)
    try {
      const r = await api(`/api/jerarquia/${p.no}`, { method: 'PATCH', body: { por: user.no, a: destino.no } })
      avisar(r.ayudanteDe
        ? t('{nombre} ahora es ayudante de {lider}.', { nombre: p.name.split(' ')[0], lider: destino.name.split(' ')[0] })
        : t('{nombre} ahora reporta a {lider}.', { nombre: p.name.split(' ')[0], lider: destino.no === user.no ? t('ti') : destino.name.split(' ')[0] }))
      cargar()
    } catch (e) {
      avisar(e.message)
    }
  }
  const ctx = { user, gerente, arrastrado, setArrastrado, puedeSoltar, mover, hijos, rama, persona, liderDe, setMoviendo }
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
      <section className={`card${arrastrado ? ' arrastrando-arbol' : ''}`}>
        <ul className="arbol"><Rama p={raiz} ctx={ctx} /></ul>
      </section>
      {moviendo && <MoverA p={moviendo} destinos={[user, ...equipo.filter((e) => e.no !== user.no)].filter((d) => puedeSoltar(moviendo, d))}
        mover={mover} cerrar={() => setMoviendo(null)} />}
    </>
  )
}

function Rama({ p, ctx }) {
  const directos = ctx.hijos(p.no)
  const ayudantes = (p.ayudantes ?? []).map(ctx.persona).filter(Boolean)
  const nodo = <Nodo p={p} ctx={ctx} directos={directos.length} total={ctx.rama(p.no).length} />
  if (!directos.length && !ayudantes.length) return <li>{nodo}</li>
  return (
    <li>
      <details open>
        <summary>{nodo}</summary>
        <ul>
          {directos.map((e) => <Rama key={e.no} p={e} ctx={ctx} />)}
          {/* Sus ayudantes: reportan a otro encargado; aquí solo se muestran (se mueven desde su lugar) */}
          {ayudantes.map((a) => <li key={`ayudante-${a.no}`} className="ayudante"><Nodo p={a} ctx={ctx} ayudante /></li>)}
        </ul>
      </details>
    </li>
  )
}

function Nodo({ p, ctx, directos = 0, total = 0, ayudante = false }) {
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
        <span className="chip" title={t('{n} en total', { n: total })}>
          {t(directos === 1 ? '{n} directo' : '{n} directos', { n: directos })}
        </span>
      )}
      {movible && (
        <button type="button" className="iconbtn mover-a-btn" aria-label={t('Mover a {nombre} a…', { nombre: p.name })} title={t('Mover a…')}
          onClick={(e) => { e.preventDefault(); ctx.setMoviendo(p) }}>
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
