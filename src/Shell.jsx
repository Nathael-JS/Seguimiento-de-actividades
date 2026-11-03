import { useCallback, useEffect, useRef, useState } from 'react'
import { api, hoy, iniciales, inicioDeHoy, modulosDe, rol } from './comun.js'
import Buzon from './Buzon.jsx'
import Departamentos from './Departamentos.jsx'
import Icono from './Icono.jsx'
import { BotonIdioma, BotonTema } from './ui.jsx'
import { t } from './i18n.js'
import Herencias from './Herencias.jsx'
import Inicio from './Inicio.jsx'
import Jerarquia from './Jerarquia.jsx'
import Matriz from './Matriz.jsx'
import MisActividades from './MisActividades.jsx'
import Monitoreo from './Monitoreo.jsx'
import Perfil from './Perfil.jsx'
import RegistrarActividad from './RegistrarActividad.jsx'
import Reportes from './Reportes.jsx'

// Una página por cada módulo de MODULOS
const PAGINAS = {
  inicio: Inicio, registrar: RegistrarActividad, 'mis-actividades': MisActividades,
  monitoreo: Monitoreo, reportes: Reportes, herencias: Herencias, matriz: Matriz, jerarquia: Jerarquia, buzon: Buzon, departamentos: Departamentos, perfil: Perfil,
}

// #monitoreo?lider=10112 → 'monitoreo' (lo que va después de ? lo lee la página)
const rutaDe = (hash) => hash.slice(1).split('?')[0] || 'inicio'

export default function Shell({ user, onLogout }) {
  const modulos = modulosDe(user)
  const [hash, setHash] = useState(location.hash)
  const ruta = rutaDe(hash)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const salir = useRef(null)
  const temporizador = useRef(null)

  useEffect(() => {
    const cambio = () => {
      setHash(location.hash)
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

  // Indicadores y notificaciones; se vuelven a pedir al cambiar de página para ver lo que hicieron otros.
  // hoy hace que el servidor genere los avisos de atraso con la fecha local
  const recargar = useCallback(
    () => api(`/api/inicio/${user.no}?desde=${encodeURIComponent(inicioDeHoy())}&hoy=${hoy()}`)
      .then((d) => { setDatos(d); setError('') }).catch((e) => setError(e.message)),
    [user.no],
  )
  useEffect(() => { recargar() }, [recargar, ruta])
  // Avisos al momento: contador y Buzón se actualizan solos cada 30 s mientras la pestaña está a la vista
  useEffect(() => {
    const id = setInterval(() => document.visibilityState === 'visible' && recargar(), 30_000)
    return () => clearInterval(id)
  }, [recargar])

  const avisar = useCallback((mensaje) => {
    clearTimeout(temporizador.current)
    setAviso(mensaje)
    temporizador.current = setTimeout(() => setAviso(''), 3000)
  }, [])

  async function cerrarSesion() {
    // Aunque falle la red se sale de la pantalla; la cookie se borra en la siguiente salida o al cerrar el navegador
    await api('/api/logout', { method: 'POST' }).catch(() => {})
    history.replaceState(null, '', location.pathname)
    onLogout()
  }

  // Una ruta que no existe o que no corresponde al rol muestra Inicio
  const actual = modulos.find((m) => m.ruta === ruta) ?? modulos[0]
  const sinLeer = datos?.notificaciones.filter((n) => !n.read).length
  const Pagina = PAGINAS[actual.ruta]

  return (
    <div className={`shell${menuAbierto ? ' nav-open' : ''}`}>
      <aside className="side" aria-label={t('Menú')}>
        <div className="brandname"><i />{t('Seguimiento de Actividades')}</div>
        {/* Cualquier clic en el menú lo cierra en móvil, también el de la página actual (no dispara hashchange) */}
        <nav className="nav" onClick={() => setMenuAbierto(false)}>
          {modulos.map((m) => (
            <a key={m.ruta} href={`#${m.ruta}`} aria-current={m === actual ? 'page' : undefined}>
              <Icono nombre={m.icono} />
              {t(m.titulo)}
              {m.ruta === 'buzon' && sinLeer > 0 && <span className="count">{sinLeer}<span className="sr"> {t('sin leer')}</span></span>}
            </a>
          ))}
          <button type="button" onClick={() => salir.current.showModal()}>
            <Icono nombre="logout" />{t('Cerrar sesión')}
          </button>
        </nav>
        <div className="spacer" />
        <div className="me">
          <span className="avatar">{iniciales(user.name)}</span>
          <div><b>{user.name}</b><div style={{ opacity: 0.75 }}>{rol(user.role)} · {user.no}</div></div>
        </div>
      </aside>

      <div className="backdrop" aria-hidden="true" onClick={() => setMenuAbierto(false)} />

      <div className="main">
        <header className="top">
          <button className="iconbtn menu" aria-label={t('Menú')} aria-expanded={menuAbierto} onClick={() => setMenuAbierto(!menuAbierto)}>
            <Icono nombre="menu" />
          </button>
          <div className="spacer" />
          <BotonIdioma />
          <BotonTema />
          <a className="iconbtn" href="#buzon" aria-label={t('Notificaciones')}>
            <Icono nombre="bell" />
            {sinLeer > 0 && <span className="dot" />}
          </a>
        </header>
        <main className="page">
          {/* key: cambiar de dirección (también solo el ?lider=) vuelve a montar la página con su estado inicial */}
          <Pagina key={hash} user={user} modulos={modulos} datos={datos} error={error} recargar={recargar} avisar={avisar} />
        </main>
      </div>

      <div className="toast" role="status">{aviso && <><Icono nombre="check" />{aviso}</>}</div>

      <dialog ref={salir} className="card modal" aria-labelledby="salir-titulo">
        <span className="warn-ic"><Icono nombre="alert" /></span>
        <h2 id="salir-titulo" className="card-title" style={{ margin: 0 }}>{t('¡Estás a punto de cerrar sesión!')}</h2>
        <p className="muted">{t('Verifica tus registros y haz los respectivos guardados antes de salir.')}</p>
        <div className="row end">
          <button className="btn btn-ghost" onClick={() => salir.current.close()} autoFocus>{t('Cancelar')}</button>
          <button className="btn btn-danger" onClick={cerrarSesion}>{t('Cerrar sesión')}</button>
        </div>
      </dialog>
    </div>
  )
}
