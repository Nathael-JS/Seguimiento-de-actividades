import { useCallback, useEffect, useRef, useState } from 'react'
import { TURNOS, api, depto, descargar, descargarCsv, dispositivo, fecha, fechaHora, hoy, rol, turnoLargo } from './comun.js'
import { Avatar } from './ui.jsx'
import Icono from './Icono.jsx'
import { t } from './i18n.js'

// Panel del super administrador: Usuarios y Registros. Los cambios piden volver a escribir su contraseña
// (el servidor responde confirmar: true); tras confirmarla, la acción se repite sola durante 5 minutos

function useConfirmacion(user) {
  const dialogo = useRef()
  const pendiente = useRef(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  // Ejecuta la acción; si el servidor pide confirmar, abre el diálogo y la repite al confirmar
  const conConfirmacion = useCallback(async (accion) => {
    try {
      return await accion()
    } catch (e) {
      if (!e.datos?.confirmar) throw e
      return new Promise((resolver, rechazar) => {
        pendiente.current = { accion, resolver, rechazar }
        setPassword('')
        setError('')
        dialogo.current.showModal()
      })
    }
  }, [])

  async function confirmar(ev) {
    ev.preventDefault()
    try {
      await api('/api/admin/confirmar', { method: 'POST', body: { por: user.no, password } })
      const { accion, resolver, rechazar } = pendiente.current
      pendiente.current = null // ya no es cancelación: el cierre del diálogo no la rechaza
      dialogo.current.close()
      accion().then(resolver, rechazar)
    } catch (e) {
      setError(e.message)
    }
  }

  const elemento = (
    <dialog ref={dialogo} className="card modal" aria-labelledby="confirmar-titulo"
      onClose={() => { pendiente.current?.rechazar(Object.assign(new Error(''), { cancelado: true })); pendiente.current = null }}>
      <form onSubmit={confirmar} noValidate style={{ display: 'contents' }}>
        <span className="warn-ic"><Icono nombre="shield" /></span>
        <h2 id="confirmar-titulo" className="card-title" style={{ margin: 0 }}>{t('Confirma que eres tú')}</h2>
        <p className="muted">{t('Escribe tu contraseña de super administrador. Vale 5 minutos para los siguientes cambios.')}</p>
        <label className="field">
          <span>{t('Tu contraseña')}</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row end">
          <button type="button" className="btn btn-ghost" onClick={() => dialogo.current.close()}>{t('Cancelar')}</button>
          <button className="btn btn-primary" type="submit" disabled={!password}>{t('Confirmar')}</button>
        </div>
      </form>
    </dialog>
  )
  return [elemento, conConfirmacion]
}

const ESTADOS_CUENTA = [['todos', 'Todos'], ['activos', 'Con acceso'], ['sin-acceso', 'Sin acceso'], ['temporal', 'Contraseña temporal']]

export function Usuarios({ user, avisar }) {
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')
  const [buscar, setBuscar] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [elegido, setElegido] = useState(null)
  const [dialogo, conConfirmacion] = useConfirmacion(user)

  const cargar = useCallback(() => api('/api/admin/usuarios').then(setLista).catch((e) => setError(e.message)), [])
  useEffect(() => { cargar() }, [cargar])

  if (error) return <p className="error" role="alert">{error}</p>
  if (!lista) return <p className="muted">{t('Cargando…')}</p>

  const texto = buscar.trim().toLowerCase()
  const visibles = lista.filter((u) =>
    (filtro === 'todos' || (filtro === 'activos' ? u.activo : filtro === 'sin-acceso' ? !u.activo : u.debeCambiar)) &&
    (!texto || [u.name, u.no, u.email].some((v) => v.toLowerCase().includes(texto))))
  const actual = lista.find((u) => u.no === elegido)

  // Toda la base en un archivo (para restaurar con npm run restaurar). Trae datos sensibles: pide la contraseña
  async function respaldar() {
    try {
      const r = await conConfirmacion(() => api('/api/admin/respaldo', { method: 'POST', body: { por: user.no } }))
      descargar(new Blob([JSON.stringify(r)], { type: 'application/json' }), `respaldo_${hoy()}.json`)
      avisar(t('Respaldo descargado. Guárdalo en un lugar seguro: trae contraseñas cifradas y secretos del MFA.'))
    } catch (e) {
      if (!e.cancelado) avisar(e.message)
    }
  }

  // Gerente, técnico e Ing. Jr de prueba (demo1234, sin código de la app) para revisar la app
  async function cuentasPrueba() {
    try {
      await conConfirmacion(() => api('/api/admin/cuentas-prueba', { method: 'POST', body: { por: user.no } }))
      avisar(t('Cuentas de prueba listas: 80001 gerente, 80004 Full, 80002 técnico y 80003 Ing. Jr, contraseña demo1234.'))
      cargar()
    } catch (e) {
      if (!e.cancelado) avisar(e.message)
    }
  }

  return (
    <>
      <div className="page-head row between" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <h1>{t('Usuarios')}</h1>
          <p>{t('Todas las cuentas del sistema. Elige una para ver sus datos y cambiar su puesto, turno o acceso.')}</p>
        </div>
        <div className="row">
          <button className="btn btn-ghost" onClick={cuentasPrueba}><Icono nombre="users" />{t('Cuentas de prueba')}</button>
          <button className="btn btn-secondary" onClick={respaldar}><Icono nombre="file" />{t('Descargar respaldo')}</button>
        </div>
      </div>
      <div className="admin">
        <section className="card admin-lista" aria-label={t('Usuarios')}>
          <label className="field">
            <span className="sr">{t('Buscar')}</span>
            <input type="search" placeholder={t('Buscar por nombre, número o correo')} value={buscar} onChange={(e) => setBuscar(e.target.value)} />
          </label>
          <div className="chips" role="group" aria-label={t('Filtrar usuarios')}>
            {ESTADOS_CUENTA.map(([k, nombre]) => (
              <button key={k} aria-pressed={filtro === k} onClick={() => setFiltro(k)}>
                {t(nombre)} <span className="mono">{k === 'todos' ? lista.length : lista.filter((u) => (k === 'activos' ? u.activo : k === 'sin-acceso' ? !u.activo : u.debeCambiar)).length}</span>
              </button>
            ))}
          </div>
          {visibles.length ? (
            <ul className="usuarios">
              {visibles.map((u) => (
                <li key={u.no}>
                  <button aria-current={u.no === elegido ? 'true' : undefined} onClick={() => setElegido(u.no)}>
                    <Avatar no={u.no} name={u.name} />
                    <span className="quien">
                      <b>{u.name}</b>
                      <span className="meta">{rol(u.role)} · <span className="mono">{u.no}</span>{u.dept && ` · ${depto(u.dept)}`}</span>
                    </span>
                    {!u.activo && <span className="tag crit-critica">{t('Sin acceso')}</span>}
                    {u.debeCambiar && <span className="tag crit-alta">{t('Temporal')}</span>}
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="empty">{t('Nadie coincide con la búsqueda.')}</p>}
        </section>

        {actual ? (
          <Ficha key={actual.no} u={actual} user={user} conConfirmacion={conConfirmacion} avisar={avisar}
            alCambiar={(nuevo) => setLista(lista.map((x) => (x.no === nuevo.no ? { ...x, ...nuevo } : x)))} />
        ) : <section className="card empty admin-vacio">{t('Elige a una persona de la lista para ver sus datos.')}</section>}
      </div>
      {dialogo}
    </>
  )
}

function Ficha({ u, user, conConfirmacion, alCambiar, avisar }) {
  const [shift, setShift] = useState(u.shift)
  const [role, setRole] = useState(u.role)
  const [temporal, setTemporal] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const esSA = u.role === 'sa'

  async function hacer(accion, aviso) {
    setError('')
    setEnviando(true)
    try {
      const r = await conConfirmacion(accion)
      if (aviso) avisar(aviso)
      return r
    } catch (e) {
      if (!e.cancelado) setError(e.message)
    } finally {
      setEnviando(false)
    }
  }
  const editar = (cambios, aviso) =>
    hacer(() => api(`/api/admin/usuarios/${u.no}`, { method: 'PATCH', body: { por: user.no, ...cambios } }), aviso).then((r) => r && alCambiar(r))

  async function restablecer() {
    const r = await hacer(() => api(`/api/admin/usuarios/${u.no}/password`, { method: 'POST', body: { por: user.no } }))
    if (r) { setTemporal(r.temporal); alCambiar({ no: u.no, debeCambiar: true }) }
  }

  return (
    <section className="card ficha" aria-labelledby="ficha-titulo">
      <header className="row" style={{ gap: 14 }}>
        <Avatar no={u.no} name={u.name} style={{ width: 48, height: 48, fontSize: 16 }} />
        <div style={{ minWidth: 0 }}>
          <h2 id="ficha-titulo" className="card-title" style={{ margin: 0 }}>{u.name}</h2>
          <div className="meta">{rol(u.role)} · <span className="mono">{u.no}</span></div>
        </div>
        <span className="spacer" />
        <span className={`badge ${u.activo ? 'badge-done' : 'badge-incomplete'}`}>{t(u.activo ? 'Con acceso' : 'Sin acceso')}</span>
      </header>

      <dl className="datos">
        <div><dt>{t('Correo electrónico')}</dt><dd>{u.email}</dd></div>
        <div><dt>{t('Departamento')}</dt><dd>{u.dept ? `${depto(u.dept)} · ${u.area}` : u.area}</dd></div>
        <div><dt>{t('Encargado')}</dt><dd>{u.bossName ?? '—'}</dd></div>
        <div><dt>{t('Turno')}</dt><dd>{turnoLargo(u.shift)} <span className="mono muted">{TURNOS[u.shift]}</span></dd></div>
        <div><dt>{t('Verificación en dos pasos')}</dt><dd>{t(u.prueba ? 'Cuenta de prueba: entra sin código' : u.mfa ? 'App vinculada' : 'Sin vincular')}</dd></div>
        <div>
          <dt>{t('Contraseña')}</dt>
          <dd>{u.sinPassword ? t('Aún no la crea') : u.debeCambiar ? t('Temporal: debe cambiarla al entrar') : t('Cambiada el {fecha} · vence en {n} días', { fecha: fecha(u.pwdChanged), n: Math.max(u.diasPassword, 0) })}</dd>
        </div>
        <div><dt>{t('Último acceso')}</dt><dd>{u.ultimoAcceso ? fechaHora(u.ultimoAcceso) : t('Sin registros')}</dd></div>
      </dl>

      {esSA ? <p className="meta">{t('Las cuentas de super administrador se manejan en el servidor (variable SUPERADMINS).')}</p> : <>
        <div className="ficha-edicion">
          <label className="field">
            <span>{t('Puesto')}</span>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {['tec', 'jr', 'full', 'sr', 'gte'].map((k) => <option key={k} value={k}>{rol(k)}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{t('Turno')}</span>
            <select value={shift} onChange={(e) => setShift(e.target.value)}>
              {Object.entries(TURNOS).map(([k, v]) => <option key={k} value={k}>{turnoLargo(k)} · {v}</option>)}
            </select>
          </label>
          <button className="btn btn-primary" disabled={enviando || (shift === u.shift && role === u.role)}
            onClick={() => editar({ shift, role }, t('Cambios guardados.'))}>{t('Guardar cambios')}</button>
        </div>

        {temporal && (
          <div className="notice warn temporal" role="status">
            <Icono nombre="shield" />
            <span>
              {t('Contraseña temporal (solo se muestra ahora):')} <code>{temporal}</code>
              <button type="button" className="link" onClick={() => navigator.clipboard?.writeText(temporal).catch(() => {})}>{t('Copiar')}</button>
              <br />{t('Al entrar tendrá que crear la suya.')}
            </span>
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}

        <div className="ficha-acciones">
          <button className="btn btn-secondary btn-sm" disabled={enviando} onClick={restablecer}>{t('Restablecer contraseña')}</button>
          <button className="btn btn-secondary btn-sm" disabled={enviando || !u.mfa}
            onClick={() => hacer(() => api(`/api/admin/usuarios/${u.no}/mfa`, { method: 'POST', body: { por: user.no } }), t('MFA reiniciado: vinculará su app al entrar.')).then((r) => r && alCambiar(r))}>
            {t('Reiniciar MFA')}
          </button>
          <span className="spacer" />
          <button className={`btn btn-sm ${u.activo ? 'btn-danger' : 'btn-primary'}`} disabled={enviando}
            onClick={() => editar({ activo: !u.activo }, t(u.activo ? 'Acceso quitado: se cerraron sus sesiones.' : 'Acceso devuelto.'))}>
            {t(u.activo ? 'Quitar acceso' : 'Dar acceso')}
          </button>
        </div>
      </>}
    </section>
  )
}

// Eventos del registro → texto
const EVENTOS = {
  login: 'Inicio de sesión', 'login-fallido': 'Contraseña incorrecta', 'login-bloqueado': 'Cuenta sin acceso',
  'mfa-fallido': 'Código de la app incorrecto', logout: 'Cierre de sesión', registro: 'Cuenta creada',
  'password-cambiada': 'Cambió su contraseña', 'password-recuperada': 'Recuperó su contraseña',
  'admin-confirmacion': 'Confirmó su contraseña', 'admin-confirmacion-fallida': 'Confirmación fallida',
  'admin-usuario': 'Cambio de cuenta', 'admin-password': 'Contraseña restablecida', 'admin-mfa': 'MFA reiniciado', 'admin-respaldo': 'Respaldo descargado',
  'registro-rechazado': 'Registro rechazado', 'admin-plantilla': 'Plantilla corregida', 'admin-gerente': 'Gerente dado de alta', 'error-servidor': 'Error del servidor', 'error-navegador': 'Error en el navegador',
  'registros-purgados': 'Registros borrados', 'login-acceso': 'Entró por otro acceso', 'admin-cuentas-prueba': 'Cuentas de prueba creadas',
}
const CAMPOS = { shift: 'Turno', role: 'Puesto', activo: 'Acceso' }
// "shift=B, activo=false" → "Turno: B · Acceso: no"
const detalle = (r) => (r.evento !== 'admin-usuario' || !r.detalle ? r.detalle ?? '' : r.detalle.split(', ').map((par) => {
  const [k, v] = par.split('=')
  return `${t(CAMPOS[k] ?? k)}: ${k === 'role' ? rol(v) : k === 'activo' ? t(v === 'true' ? 'sí' : 'no') : v}`
}).join(' · '))
const COLUMNAS = ['Fecha y hora', 'Evento', 'Usuario', 'IP', 'Equipo', 'Detalle', 'Hecho por']
const quien = (r) => (r.name ? `${r.name} (${r.no})` : r.usuario ? `“${r.usuario}”` : '—')

export function Registros({ user, avisar }) {
  const [filas, setFilas] = useState(null)
  const [q, setQ] = useState('')
  const [evento, setEvento] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [antes, setAntes] = useState('')
  const [error, setError] = useState('')
  const [dialogo, conConfirmacion] = useConfirmacion(user)

  const consulta = new URLSearchParams(Object.entries({ q: q.trim(), evento, desde, hasta }).filter(([, v]) => v)).toString()
  const cargar = useCallback(() => api(`/api/admin/registros${consulta ? `?${consulta}` : ''}`)
    .then((f) => { setError(''); setFilas(f) }).catch((e) => setError(e.message)), [consulta])
  useEffect(() => {
    const id = setTimeout(cargar, 250) // al escribir en la búsqueda, una consulta por pausa
    return () => clearTimeout(id)
  }, [cargar])

  async function purgar() {
    try {
      const { borrados } = await conConfirmacion(() => api('/api/admin/registros/purgar', { method: 'POST', body: { por: user.no, antes } }))
      avisar(t('{n} registros borrados.', { n: borrados }))
      setAntes('')
      cargar()
    } catch (e) {
      if (!e.cancelado) setError(e.message)
    }
  }

  return (
    <>
      <div className="page-head row between" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <h1>{t('Registros')}</h1>
          <p>{t('Cada inicio de sesión, intento fallido y cambio hecho por un super administrador, con su IP y su equipo.')}</p>
        </div>
        <div className="row">
          <button className="btn btn-secondary" onClick={cargar}>{t('Actualizar')}</button>
          <button className="btn btn-secondary" disabled={!filas?.length}
            onClick={() => descargarCsv(COLUMNAS, filas.map((r) => [fechaHora(r.at), t(EVENTOS[r.evento] ?? r.evento), quien(r), r.ip, dispositivo(r.agente), detalle(r), r.porName ?? '']), `${t('registros')}_${hoy()}.csv`)}>
            {t('Exportar CSV')}
          </button>
        </div>
      </div>

      <div className="card filters registros-filtros">
        <label className="field"><span>{t('Buscar')}</span><input type="search" value={q} placeholder={t('Nombre, número, IP…')} onChange={(e) => setQ(e.target.value)} /></label>
        <label className="field">
          <span>{t('Evento')}</span>
          <select value={evento} onChange={(e) => setEvento(e.target.value)}>
            <option value="">{t('Todos')}</option>
            {Object.entries(EVENTOS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
          </select>
        </label>
        <label className="field"><span>{t('Desde')}</span><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
        <label className="field"><span>{t('Hasta')}</span><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      {!filas ? <p className="muted">{t('Cargando…')}</p> : (
        <div className="table-wrap">
          <table className="registros">
            <caption className="sr">{t('{n} registros', { n: filas.length })}</caption>
            <thead><tr>{COLUMNAS.map((c) => <th key={c} scope="col">{t(c)}</th>)}</tr></thead>
            <tbody>
              {filas.length ? filas.map((r) => (
                <tr key={r.id} className={r.ok ? '' : 'fallo'}>
                  <td className="mono nowrap">{fechaHora(r.at)}</td>
                  <td><span className={`evento ${r.ok ? '' : 'mal'} ${r.evento.startsWith('admin') || r.evento === 'registros-purgados' ? 'admin' : ''}`}>{t(EVENTOS[r.evento] ?? r.evento)}</span></td>
                  <td>{quien(r)}</td>
                  <td className="mono">{r.ip}</td>
                  <td title={r.agente}>{dispositivo(r.agente)}</td>
                  <td>{detalle(r) || '—'}</td>
                  <td>{r.porName ?? '—'}</td>
                </tr>
              )) : <tr><td colSpan={COLUMNAS.length} className="empty">{t('No hay registros con estos filtros.')}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <section className="card purgar">
        <div>
          <h2 className="card-title" style={{ margin: 0 }}>{t('Borrar registros antiguos')}</h2>
          <p className="meta">{t('Borra todo lo anterior a la fecha; el borrado queda registrado. Los registros no se editan uno por uno.')}</p>
        </div>
        <label className="field"><span>{t('Anteriores a')}</span><input type="date" value={antes} max={hoy()} onChange={(e) => setAntes(e.target.value)} /></label>
        <button className="btn btn-danger" disabled={!antes} onClick={purgar}>{t('Borrar')}</button>
      </section>
      {dialogo}
    </>
  )
}

// Plantillas: quién viene en la plantilla de su departamento y si ya se registró. A quien aún no se registra se le
// corrige el número o el correo (o se quita), y los intentos de registro rechazados se comparan con la plantilla
export function Plantillas({ user, avisar }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('por-registrar')
  const [editando, setEditando] = useState(null) // número de la fila en edición
  const [quitar, setQuitar] = useState(null) // número de la fila por confirmar
  const [dialogo, conConfirmacion] = useConfirmacion(user)

  const cargar = useCallback(() => api('/api/admin/plantillas').then((d) => { setError(''); setDatos(d) }).catch((e) => setError(e.message)), [])
  useEffect(() => { cargar() }, [cargar])

  async function accion(hacer, mensaje) {
    try {
      await conConfirmacion(hacer)
      setEditando(null)
      setQuitar(null)
      avisar(mensaje)
      cargar()
    } catch (e) {
      if (!e.cancelado) avisar(e.message)
    }
  }
  const corregir = (p, cambios) => accion(() => api(`/api/admin/plantillas/${p.no}`, { method: 'PATCH', body: { por: user.no, ...cambios } }), t('Plantilla corregida: ya puede registrarse con esos datos.'))
  const eliminar = (p) => accion(() => api(`/api/admin/plantillas/${p.no}`, { method: 'DELETE', body: { por: user.no } }), t('{nombre} se quitó de la plantilla.', { nombre: p.name }))

  if (error) return <p className="error" role="alert">{error}</p>
  if (!datos) return <p className="muted">{t('Cargando…')}</p>

  const porRegistrar = datos.personas.filter((p) => p.porRegistrar).length
  const lista = datos.personas.filter((p) => filtro === 'todas' || (filtro === 'por-registrar') === p.porRegistrar)
  // Con quién de las plantillas coincide lo que escribió quien no pudo registrarse
  const pista = (r) => {
    const porNo = datos.personas.find((p) => p.no === r.usuario)
    const porCorreo = datos.personas.find((p) => p.email === r.detalle)
    if (porNo && !porNo.porRegistrar) return t('{nombre} ya se registró', { nombre: porNo.name })
    if (porNo) return t('El número es de {nombre}; en la plantilla su correo es {correo}', { nombre: porNo.name, correo: porNo.email })
    if (porCorreo) return t('El correo es de {nombre}, con número {no}', { nombre: porCorreo.name, no: porCorreo.no })
    return t('No está en ninguna plantilla')
  }

  return (
    <>
      {dialogo}
      <div className="page-head">
        <h1>{t('Plantillas')}</h1>
        <p>{t('Quién viene en la plantilla de su departamento y si ya se registró. Corrige el número o el correo de quien no pudo registrarse.')}</p>
      </div>

      <NuevoGerente user={user} conConfirmacion={conConfirmacion} alCrear={(g) => { avisar(t('{nombre} quedó por registrar como gerente: ya puede crear su cuenta.', { nombre: g.name })); cargar() }} />

      <div className="chips" role="group" aria-label={t('Filtrar plantillas')}>
        {[['por-registrar', t('Por registrar ({n})', { n: porRegistrar })], ['registradas', t('Registradas ({n})', { n: datos.personas.length - porRegistrar })], ['todas', t('Todas')]].map(([k, nombre]) => (
          <button key={k} aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{nombre}</button>
        ))}
      </div>

      <section className="card">
        {!lista.length ? <p className="empty">{t('Nadie en esta vista.')}</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr>{['Número', 'Nombre', 'Correo', 'Puesto', 'Departamento', 'Encargado', 'Estado', ''].map((c) => <th key={c} scope="col">{c && t(c)}</th>)}</tr></thead>
              <tbody>
                {lista.map((p) => editando === p.no
                  ? <FilaPlantilla key={p.no} p={p} guardar={(cambios) => corregir(p, cambios)} cancelar={() => setEditando(null)} />
                  : (
                    <tr key={p.no}>
                      <td className="mono">{p.no}</td>
                      <td>{p.name}</td>
                      <td>{p.email}</td>
                      <td>{rol(p.role)}</td>
                      <td>{depto(p.dept)}</td>
                      <td>{p.bossName ?? '—'}</td>
                      <td>{p.porRegistrar ? <span className="tag">{t('Por registrar')}</span> : <span className="tag suave">{t('Registrada')}</span>}</td>
                      <td className="nowrap">
                        {p.porRegistrar && (quitar === p.no ? (
                          <>
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => eliminar(p)}>{t('Sí, quitar')}</button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQuitar(null)}>{t('Cancelar')}</button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditando(p.no)}>{t('Corregir')}</button>
                            <button type="button" className="btn btn-ghost btn-sm peligro" onClick={() => setQuitar(p.no)}>{t('Quitar')}</button>
                          </>
                        ))}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">{t('Intentos de registro rechazados')}</h2>
        <p className="muted" style={{ fontSize: 14 }}>{t('Número y correo que escribió la persona y con quién coinciden en las plantillas.')}</p>
        {!datos.rechazados.length ? <p className="empty">{t('Ningún intento rechazado.')}</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr>{['Fecha y hora', 'Número escrito', 'Correo escrito', 'IP', 'Coincidencia'].map((c) => <th key={c} scope="col">{t(c)}</th>)}</tr></thead>
              <tbody>
                {datos.rechazados.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{fechaHora(r.at)}</td>
                    <td className="mono">{r.usuario}</td>
                    <td>{r.detalle}</td>
                    <td className="mono">{r.ip}</td>
                    <td>{pista(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

// Alta del gerente de un departamento (el primero de todos, o uno que se quedó sin gerente): queda por registrar y
// se registra en la app con su número y correo; el departamento se crea si no existe
function NuevoGerente({ user, conConfirmacion, alCrear }) {
  const vacio = { name: '', no: '', email: '', shift: 'D', departamento: '' }
  const [d, setD] = useState(vacio)
  const [error, setError] = useState('')
  const set = (campo) => (e) => setD({ ...d, [campo]: e.target.value })
  async function crear(e) {
    e.preventDefault()
    if (d.name.trim().length < 3 || !/^\d{4,10}$/.test(d.no.trim()) || !/^\S+@\S+\.\S+$/.test(d.email.trim()) || d.departamento.trim().length < 3) {
      return setError(t('Escribe nombre, número (4 a 10 dígitos), correo y departamento.'))
    }
    setError('')
    try {
      const g = await conConfirmacion(() => api('/api/admin/gerentes', { method: 'POST', body: { por: user.no, ...d, no: d.no.trim(), email: d.email.trim() } }))
      setD(vacio)
      alCrear(g)
    } catch (err) {
      if (!err.cancelado) setError(err.message)
    }
  }
  return (
    <details className="card nuevo-gerente">
      <summary><Icono nombre="user" />{t('Nuevo gerente')}</summary>
      <form className="filters" onSubmit={crear} noValidate>
        <label className="field"><span>{t('Nombre completo')}</span><input value={d.name} maxLength={100} onChange={set('name')} /></label>
        <label className="field"><span>{t('Número de empleado')}</span><input inputMode="numeric" maxLength={10} value={d.no} onChange={set('no')} /></label>
        <label className="field"><span>{t('Correo electrónico')}</span><input type="email" maxLength={100} value={d.email} onChange={set('email')} /></label>
        <label className="field">
          <span>{t('Turno')}</span>
          <select value={d.shift} onChange={set('shift')}>
            {Object.entries(TURNOS).map(([k, v]) => <option key={k} value={k}>{turnoLargo(k)} · {v}</option>)}
          </select>
        </label>
        <label className="field"><span>{t('Departamento')}</span><input maxLength={60} placeholder={t('Se crea si no existe')} value={d.departamento} onChange={set('departamento')} /></label>
        <button className="btn btn-primary" type="submit">{t('Dar de alta')}</button>
        {error && <p className="error wide" role="alert">{error}</p>}
      </form>
    </details>
  )
}

function FilaPlantilla({ p, guardar, cancelar }) {
  const [no, setNo] = useState(p.no)
  const [email, setEmail] = useState(p.email)
  return (
    <tr className="editando">
      <td><input aria-label={t('Número de empleado')} inputMode="numeric" maxLength={10} value={no} onChange={(e) => setNo(e.target.value.trim())} /></td>
      <td>{p.name}</td>
      <td><input aria-label={t('Correo electrónico')} type="email" maxLength={100} value={email} onChange={(e) => setEmail(e.target.value)} /></td>
      <td>{rol(p.role)}</td>
      <td>{depto(p.dept)}</td>
      <td>{p.bossName ?? '—'}</td>
      <td />
      <td className="nowrap">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => guardar({ ...(no !== p.no && { no }), ...(email.trim() !== p.email && { email: email.trim() }) })}>{t('Guardar')}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={cancelar}>{t('Cancelar')}</button>
      </td>
    </tr>
  )
}
