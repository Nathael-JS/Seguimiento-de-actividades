import { useCallback, useEffect, useRef, useState } from 'react'
import { ROLES, api, iniciales, modulosDe } from './comun.js'
import Buzon from './Buzon.jsx'
import Icono from './Icono.jsx'
import Inicio from './Inicio.jsx'
import MisActividades from './MisActividades.jsx'
import Monitoreo from './Monitoreo.jsx'
import RegistrarActividad from './RegistrarActividad.jsx'
import Reportes from './Reportes.jsx'

// Los módulos que no están aquí se muestran como "en desarrollo"
const PAGINAS = {
  inicio: Inicio, registrar: RegistrarActividad, 'mis-actividades': MisActividades,
  monitoreo: Monitoreo, reportes: Reportes, buzon: Buzon,
}

const rutaActual = () => location.hash.slice(1) || 'inicio'

export default function Shell({ user, onLogout }) {
  const modulos = modulosDe(user)
  const [ruta, setRuta] = useState(rutaActual)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const salir = useRef(null)
  const temporizador = useRef(null)

  useEffect(() => {
    const cambio = () => {
      setRuta(rutaActual())
      setMenuAbierto(false)
    }
    addEventListener('hashchange', cambio)
    return () => removeEventListener('hashchange', cambio)
  }, [])

  useEffect(() => {
    if (!menuAbierto) return
    const escape = (e) => e.key === 'Escape' && setMenuAbierto(false)
    addEventListener('keydown', escape)
    return () => removeEventListener('keydown', escape)
  }, [menuAbierto])

  // Indicadores y notificaciones; se vuelven a pedir al cambiar de página para ver lo que hicieron otros
  const recargar = useCallback(
    () => api(`/api/inicio/${user.no}`).then((d) => { setDatos(d); setError('') }).catch((e) => setError(e.message)),
    [user.no],
  )
  useEffect(() => { recargar() }, [recargar, ruta])

  const avisar = useCallback((mensaje) => {
    clearTimeout(temporizador.current)
    setAviso(mensaje)
    temporizador.current = setTimeout(() => setAviso(''), 3000)
  }, [])

  function cerrarSesion() {
    history.replaceState(null, '', location.pathname)
    onLogout()
  }

  // Una ruta que no existe o que no corresponde al rol muestra Inicio
  const actual = modulos.find((m) => m.ruta === ruta) ?? modulos[0]
  const sinLeer = datos?.notificaciones.filter((n) => !n.read).length
  const Pagina = PAGINAS[actual.ruta]

  return (
    <div className={`shell${menuAbierto ? ' nav-open' : ''}`}>
      <aside className="side" aria-label="Menú">
        <div className="brandname"><i />Seguimiento de Actividades</div>
        {/* Cualquier clic en el menú lo cierra en móvil, también el de la página actual (no dispara hashchange) */}
        <nav className="nav" onClick={() => setMenuAbierto(false)}>
          {modulos.map((m) => (
            <a key={m.ruta} href={`#${m.ruta}`} aria-current={m === actual ? 'page' : undefined}>
              <Icono nombre={m.icono} />
              {m.titulo}
              {m.ruta === 'buzon' && sinLeer > 0 && <span className="count">{sinLeer}<span className="sr"> sin leer</span></span>}
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

      <div className="backdrop" aria-hidden="true" onClick={() => setMenuAbierto(false)} />

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
          {Pagina
            ? <Pagina user={user} modulos={modulos} datos={datos} error={error} recargar={recargar} avisar={avisar} />
            : <EnDesarrollo titulo={actual.titulo} />}
        </main>
      </div>

      <div className="toast" role="status">{aviso && <><Icono nombre="check" />{aviso}</>}</div>

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
