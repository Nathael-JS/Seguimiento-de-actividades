import { useEffect, useRef, useState } from 'react'
import { ROLES, iniciales, modulosDe } from './comun.js'
import Icono from './Icono.jsx'
import Inicio from './Inicio.jsx'

const rutaActual = () => location.hash.slice(1) || 'inicio'

export default function Shell({ user, onLogout }) {
  const modulos = modulosDe(user)
  const [ruta, setRuta] = useState(rutaActual)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const salir = useRef(null)

  useEffect(() => {
    const cambio = () => {
      setRuta(rutaActual())
      setMenuAbierto(false)
    }
    addEventListener('hashchange', cambio)
    return () => removeEventListener('hashchange', cambio)
  }, [])

  useEffect(() => {
    fetch(`/api/inicio/${user.no}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then(setDatos)
      .catch(() => setError('No se pudieron cargar tus datos. Recarga la página.'))
  }, [user.no])

  function cerrarSesion() {
    history.replaceState(null, '', location.pathname)
    onLogout()
  }

  // Una ruta que no existe o que no corresponde al rol muestra Inicio
  const actual = modulos.find((m) => m.ruta === ruta) ?? modulos[0]
  const sinLeer = datos?.notificaciones.filter((n) => !n.read).length

  return (
    <div className={`shell${menuAbierto ? ' nav-open' : ''}`}>
      <aside className="side" aria-label="Menú">
        <div className="brandname"><i />Seguimiento de Actividades</div>
        <nav className="nav">
          {modulos.map((m) => (
            <a key={m.ruta} href={`#${m.ruta}`} aria-current={m === actual ? 'page' : undefined}>
              <Icono nombre={m.icono} />
              {m.titulo}
              {m.ruta === 'buzon' && sinLeer > 0 && <span className="count" aria-label={`${sinLeer} sin leer`}>{sinLeer}</span>}
            </a>
          ))}
          <button type="button" onClick={() => salir.current.showModal()}>
            <Icono nombre="logout" />Cerrar sesión
          </button>
        </nav>
        <div className="spacer" />
        <div className="me">
          <span className="avatar">{iniciales(user.name)}</span>
          <div><b>{user.name}</b><div style={{ opacity: 0.75 }}>{ROLES[user.role]} · {user.no}</div></div>
        </div>
      </aside>

      <div className="main">
        <header className="top">
          <button className="iconbtn menu" aria-label="Menú" aria-expanded={menuAbierto} onClick={() => setMenuAbierto(!menuAbierto)}>
            <Icono nombre="menu" />
          </button>
          <div className="spacer" />
          <a className="iconbtn" href="#buzon" aria-label="Notificaciones">
            <Icono nombre="bell" />
            {sinLeer > 0 && <span className="dot" />}
          </a>
        </header>
        <main className="page">
          {actual.ruta === 'inicio'
            ? <Inicio user={user} modulos={modulos} datos={datos} error={error} />
            : <EnDesarrollo titulo={actual.titulo} />}
        </main>
      </div>

      <dialog ref={salir} className="card modal" aria-labelledby="salir-titulo">
        <span className="warn-ic"><Icono nombre="alert" /></span>
        <h2 id="salir-titulo" className="card-title" style={{ margin: 0 }}>¡Estás a punto de cerrar sesión!</h2>
        <p className="muted">Verifica tus registros y haz los respectivos guardados antes de salir.</p>
        <div className="row end">
          <button className="btn btn-ghost" onClick={() => salir.current.close()} autoFocus>Cancelar</button>
          <button className="btn btn-danger" onClick={cerrarSesion}>Cerrar sesión</button>
        </div>
      </dialog>
    </div>
  )
}

function EnDesarrollo({ titulo }) {
  return (
    <>
      <div className="page-head"><h1>{titulo}</h1></div>
      <section className="card empty">Esta sección está en desarrollo.</section>
    </>
  )
}
