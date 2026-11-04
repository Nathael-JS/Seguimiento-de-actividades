import { useEffect, useState } from 'react'
import { api, esEncargado, nombreTurno, rol } from './comun.js'
import { Avatar } from './ui.jsx'
import { t } from './i18n.js'

// Árbol de la rama de quien consulta, armado con el campo boss de su equipo
export default function Jerarquia({ user }) {
  const [equipo, setEquipo] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api(`/api/equipo/${user.no}`).then(setEquipo).catch((e) => setError(e.message))
  }, [user.no])

  if (error) return <p className="error" role="alert">{error}</p>
  if (!equipo) return <p className="muted">{t('Cargando…')}</p>

  const hijos = (no) => equipo.filter((e) => e.boss === no)

  return (
    <>
      <div className="page-head">
        <h1>{t('Jerarquía')}</h1>
        <p>{t('Quién reporta a quién en tu equipo. Toca una rama para plegarla; abre a una persona para ver sus actividades.')}</p>
      </div>
      <section className="card">
        <ul className="arbol"><Rama p={user} yo={user.no} hijos={hijos} /></ul>
      </section>
    </>
  )
}

function Rama({ p, yo, hijos }) {
  const directos = hijos(p.no)
  const total = (no) => hijos(no).reduce((s, e) => s + 1 + total(e.no), 0)
  const nodo = <Nodo p={p} yo={p.no === yo} directos={directos.length} total={total(p.no)} />
  if (!directos.length) return <li>{nodo}</li>
  return (
    <li>
      <details open>
        <summary>{nodo}</summary>
        <ul>{directos.map((e) => <Rama key={e.no} p={e} yo={yo} hijos={hijos} />)}</ul>
      </details>
    </li>
  )
}

function Nodo({ p, yo, directos, total }) {
  // A los líderes se les ve con su equipo en Monitoreo; a los demás, con sus actividades
  const destino = `#monitoreo?${esEncargado(p.role) ? 'lider' : 'empleado'}=${p.no}`
  return (
    <span className="nodo" data-rol={p.role}>
      <Avatar no={p.no} name={p.name} />
      <span className="nodo-txt">
        {yo ? <b>{p.name} <span className="muted">({t('tú')})</span></b> : <a href={destino}><b>{p.name}</b></a>}
        <small>{rol(p.role)} · <span className="mono">{p.no}</span> · {nombreTurno(p.shift)}</small>
      </span>
      {directos > 0 && (
        <span className="chip" title={t('{n} en total', { n: total })}>
          {t(directos === 1 ? '{n} directo' : '{n} directos', { n: directos })}
        </span>
      )}
    </span>
  )
}
