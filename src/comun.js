import { idiomaActual, t } from './i18n.js'

export const ROLES = { tec: 'Técnico', jr: 'Ing. Jr', full: 'Ing. Full', sr: 'Senior', gte: 'Gerente' }
export const TURNOS = { A: '06:00–14:30', B: '14:30–23:00', C: '23:00–06:00' }
export const DEPARTAMENTOS = { lc: 'Liquid Cooling', pf: 'Pruebas Funcionales', smt: 'SMT' }
export const ESTADOS = { done: 'Realizada', progress: 'En proceso', pending: 'Pendiente', incomplete: 'Incompleta' }

// Nombres ya traducidos al idioma actual
export const rol = (k) => t(ROLES[k])
export const depto = (k) => t(DEPARTAMENTOS[k])
export const estado = (k) => t(ESTADOS[k])

// `solo` limita el módulo a encargados (Ing. Full, Senior, Gerente); `excepto` lo oculta a un puesto
export const MODULOS = [
  { ruta: 'inicio', titulo: 'Inicio', icono: 'home' },
  { ruta: 'registrar', titulo: 'Registrar actividad', icono: 'plus', desc: 'Asigna actividades por puntos a tu equipo.', solo: 'encargado' },
  { ruta: 'mis-actividades', titulo: 'Mis actividades', icono: 'list', desc: 'Actualiza el estado de tus tareas.', excepto: 'gte' },
  { ruta: 'monitoreo', titulo: 'Monitoreo', icono: 'chart', desc: 'Avance de tu equipo en tiempo real.', solo: 'encargado' },
  { ruta: 'reportes', titulo: 'Reportes', icono: 'file', desc: 'Genera reportes por fecha, turno y hora.', solo: 'encargado' },
  { ruta: 'buzon', titulo: 'Buzón', icono: 'bell', desc: 'Asignaciones, avances y comentarios.' },
  { ruta: 'departamentos', titulo: 'Departamentos', icono: 'building', desc: 'Plantilla por puesto y rate.' },
  { ruta: 'perfil', titulo: 'Perfil', icono: 'user', desc: 'Tus datos y contraseña.' },
]

export const modulosDe = (user) =>
  MODULOS.filter((m) => (!m.solo || user.encargado) && m.excepto !== user.role)

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
    throw new Error(t('No se pudo conectar con el servidor. Intenta de nuevo.'))
  }
  const data = await res.json().catch(() => ({}))
  if (res.ok) return data
  if (data.sesion === false) dispatchEvent(new Event('sesion-terminada')) // App vuelve al login
  // Los errores propios de Fastify (validación del esquema, ruta inexistente) traen statusCode y un texto en inglés;
  // los de la app traen solo `error`, ya redactado para el usuario (en español: se traduce aquí)
  if (data.statusCode) throw new Error(t(res.status === 400 ? 'Revisa los datos ingresados.' : 'Ocurrió un error. Intenta de nuevo.'))
  throw new Error(t(data.error ?? 'Ocurrió un error. Intenta de nuevo.'))
}

// Fecha local en formato AAAA-MM-DD, el que usan los <input type="date">
export const hoy = () => new Date().toLocaleDateString('en-CA')
// Fecha y zona horaria del navegador: el servidor las usa para el rate de aprobación ("a tiempo" en tu hora local)
export const consultaRate = () => `hoy=${hoy()}&zona=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`
// Fin del turno en la hora local: la próxima vez que llega su hora de salida (A 14:30, B 23:00, C 06:00).
// Una tarea urgente se cierra en ese momento
export function finTurno(turno, ahora = new Date()) {
  const [h, m] = TURNOS[turno].split('–')[1].split(':').map(Number)
  const fin = new Date(ahora)
  fin.setHours(h, m, 0, 0)
  if (fin <= ahora) fin.setDate(fin.getDate() + 1)
  return fin
}
// Medianoche local de hoy como instante UTC: el servidor la usa para "lo realizado hoy"
export const inicioDeHoy = () => new Date(new Date().setHours(0, 0, 0, 0)).toISOString()

export const promedio = (actividades) =>
  actividades.length ? Math.round(actividades.reduce((s, a) => s + a.pct, 0) / actividades.length) : 0

export const esEncargado = (role) => role === 'gte' || role === 'sr' || role === 'full'

// Las mismas reglas que valida el servidor para una contraseña nueva
export const reglasPassword = (p1, p2) => [
  ['Mínimo 10 caracteres', p1.length >= 10],
  ['Una mayúscula y una minúscula', /[a-z]/.test(p1) && /[A-Z]/.test(p1)],
  ['Al menos un número', /\d/.test(p1)],
  ['Al menos un símbolo', /[^A-Za-z0-9]/.test(p1)],
  ['Las contraseñas coinciden', p1.length > 0 && p1 === p2],
]

export const passwordValida = (p1, p2) => reglasPassword(p1, p2).every(([, ok]) => ok)

// El servidor guarda instantes en UTC; aquí se muestran en la hora local de quien mira
const locale = () => (idiomaActual() === 'en' ? 'en-US' : 'es-MX')
export const hora = (iso) => new Date(iso).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', hour12: false })
// Fecha de trabajo AAAA-MM-DD (sin hora) como "28 oct"; se lee como medianoche local para no correr de día
export const dia = (fecha) => new Date(`${fecha}T00:00`).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })
export const fecha = (iso) => new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' })
// Encabezado de grupo del Buzón según el día local: "Hoy", "Ayer" o la fecha
export function grupoDia(iso, ahora = new Date()) {
  const clave = (d) => d.toLocaleDateString('en-CA')
  const ayer = new Date(ahora)
  ayer.setDate(ayer.getDate() - 1)
  const d = new Date(iso)
  if (clave(d) === clave(ahora)) return t('Hoy')
  if (clave(d) === clave(ayer)) return t('Ayer')
  return d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' })
}
export const fechaHora = (iso) =>
  new Date(iso).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
