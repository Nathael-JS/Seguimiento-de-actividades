export const ROLES = { tec: 'Técnico', jr: 'Ing. Jr', full: 'Ing. Full', sr: 'Senior', gte: 'Gerente' }
export const TURNOS = { A: '06:00–14:30', B: '14:30–23:00', C: '23:00–06:00' }
export const DEPARTAMENTOS = { lc: 'Liquid Cooling', pf: 'Pruebas Funcionales', smt: 'SMT' }
export const ESTADOS = { done: 'Realizada', progress: 'En proceso', pending: 'Pendiente', incomplete: 'Incompleta' }

// `solo` limita el módulo a encargados (Ing. Full, Senior, Gerente) o a ejecutores (Técnico, Ing. Jr)
export const MODULOS = [
  { ruta: 'inicio', titulo: 'Inicio', icono: 'home' },
  { ruta: 'registrar', titulo: 'Registrar actividad', icono: 'plus', desc: 'Asigna actividades por puntos a tu equipo.', solo: 'encargado' },
  { ruta: 'mis-actividades', titulo: 'Mis actividades', icono: 'list', desc: 'Actualiza el estado de tus tareas.', solo: 'ejecutor' },
  { ruta: 'monitoreo', titulo: 'Monitoreo', icono: 'chart', desc: 'Avance de tu equipo en tiempo real.', solo: 'encargado' },
  { ruta: 'reportes', titulo: 'Reportes', icono: 'file', desc: 'Genera reportes por fecha, turno y hora.', solo: 'encargado' },
  { ruta: 'buzon', titulo: 'Buzón', icono: 'bell', desc: 'Asignaciones, avances y comentarios.' },
  { ruta: 'departamentos', titulo: 'Departamentos', icono: 'building', desc: 'Plantilla por puesto y rate.' },
  { ruta: 'perfil', titulo: 'Perfil', icono: 'user', desc: 'Tus datos y contraseña.' },
]

export const modulosDe = (user) =>
  MODULOS.filter((m) => !m.solo || (m.solo === 'encargado') === user.encargado)

export const iniciales = (nombre) => nombre.split(' ').map((p) => p[0]).slice(0, 2).join('')

// fetch con JSON; lanza un Error con el mensaje del servidor si la respuesta no es 2xx
export async function api(url, { method = 'GET', body } = {}) {
  let res
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body && JSON.stringify(body),
    })
  } catch {
    throw new Error('No se pudo conectar con el servidor. Intenta de nuevo.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(res.status === 400 ? 'Revisa los datos ingresados.' : data.error ?? 'Ocurrió un error. Intenta de nuevo.')
  return data
}

// Fecha local en formato AAAA-MM-DD, el que usan los <input type="date">
export const hoy = () => new Date().toLocaleDateString('en-CA')

export const promedio = (actividades) =>
  actividades.length ? Math.round(actividades.reduce((s, a) => s + a.pct, 0) / actividades.length) : 0

export const esEncargado = (role) => role === 'gte' || role === 'sr' || role === 'full'
