import { idiomaActual, t } from './i18n.js'

export const ROLES = { tec: 'Técnico', jr: 'Ing. Jr', full: 'Ing. Full', sr: 'Senior', gte: 'Gerente', sa: 'Super administrador' }
// Turnos: claves internas A–D (así quedan guardados); en pantalla, número y nombre (Turno 1 · Matutino)
export const TURNOS = { A: '07:00–15:00', B: '15:00–22:30', C: '22:30–07:00', D: '08:00–17:30' }
const NOMBRES_TURNO = { A: [1, 'Matutino'], B: [2, 'Vespertino'], C: [3, 'Nocturno'], D: [4, 'Administrativo'] }
export const DEPARTAMENTOS = { lc: 'Liquid Cooling', pf: 'Pruebas Funcionales', smt: 'SMT' }
export const ESTADOS = { done: 'Realizada', progress: 'En proceso', pending: 'Pendiente', incomplete: 'Incompleta' }
// Criticidad de una actividad diaria, de menor a mayor. La crítica va debajo de la urgente y sí se hereda
export const CRITICIDADES = { simple: 'Simple', normal: 'Normal', alta: 'Alta', critica: 'Crítica' }

// Nombres ya traducidos al idioma actual
export const rol = (k) => t(ROLES[k])
// Los creados por un gerente llegan del servidor (/api/deptos) con su nombre tal cual, sin traducción
const deptosCreados = {}
// Manda el nombre guardado (el gerente puede renombrar); t() traduce los de siempre y deja igual los demás
export const registrarDeptos = (lista) => lista.forEach((d) => { deptosCreados[d.clave] = d.nombre })
export const depto = (k) => { const n = deptosCreados[k] ?? DEPARTAMENTOS[k]; return n ? t(n) : k }
export const clavesDeptos = () => [...Object.keys(DEPARTAMENTOS), ...Object.keys(deptosCreados)]
// Acceso desde la portada: Gerencia (encargados) o Jr / Técnico
export const ACCESOS = { gerencia: ['gte', 'sr', 'full'], operativo: ['jr', 'tec'] }
export const estado = (k) => t(ESTADOS[k])
export const criticidad = (k) => t(CRITICIDADES[k ?? 'normal'])
// Cada cuándo se repite una tarea recurrente (al llegar el periodo se crea una copia nueva)
export const PERIODOS = { diaria: 'Cada día hábil', semanal: 'Cada semana', mensual: 'Cada mes' }
// Columnas del tablero: la criticidad, Urgente o Por clasificar (las recién creadas)
export const columnaTablero = (c) => (c === 'urgente' ? t('Urgente') : c === 'nueva' ? t('Por clasificar') : criticidad(c))
export const PESO_CRITICIDAD = { simple: 0, nueva: 1, normal: 1, alta: 2, critica: 3 }

// `solo` limita el módulo a encargados (Ing. Full, Senior, Gerente); `excepto` lo oculta a un puesto
// Agrupados por uso: el día a día del turno, el seguimiento del equipo y la organización (el menú los separa
// cuando hay muchos, como en Gerencia)
export const MODULOS = [
  { ruta: 'inicio', titulo: 'Inicio', icono: 'home', grupo: 'Día a día' },
  { ruta: 'tablero', titulo: 'Tablero', icono: 'board', desc: 'Actividades por criticidad, semana a semana.', grupo: 'Día a día' },
  { ruta: 'mis-actividades', titulo: 'Actividades asignadas', icono: 'list', desc: 'Actualiza el estado de tus tareas.', excepto: 'gte', grupo: 'Día a día' },
  { ruta: 'herencias', titulo: 'Herencias', icono: 'swap', desc: 'Propón, valida y redirige actividades heredadas.', solo: 'encargado', grupo: 'Día a día' },
  { ruta: 'buzon', titulo: 'Buzón', icono: 'bell', desc: 'Asignaciones, avances y comentarios.', grupo: 'Día a día' },
  { ruta: 'monitoreo', titulo: 'Monitoreo', icono: 'chart', desc: 'Avance de tu equipo en tiempo real.', solo: 'encargado', grupo: 'Seguimiento' },
  { ruta: 'reportes', titulo: 'Reportes', icono: 'file', desc: 'Genera reportes por fecha, turno y hora.', solo: 'encargado', grupo: 'Seguimiento' },
  { ruta: 'matriz', titulo: 'Matriz de seguimiento', icono: 'grid', desc: 'Yield, tiempo extra y asistencia de tu equipo.', solo: 'encargado', grupo: 'Seguimiento' },
  { ruta: 'jerarquia', titulo: 'Jerarquía', icono: 'tree', desc: 'Quién reporta a quién en tu equipo.', solo: 'encargado', grupo: 'Seguimiento' },
  { ruta: 'usuarios', titulo: 'Usuarios', icono: 'users', desc: 'Cuentas, puestos, turnos y acceso al sistema.', solo: 'sa', grupo: 'Organización' },
  { ruta: 'registros', titulo: 'Registros', icono: 'log', desc: 'Quién entra, cuándo y desde dónde.', solo: 'sa', grupo: 'Organización' },
  { ruta: 'plantillas', titulo: 'Plantillas', icono: 'file', desc: 'Quién se registró y quién falta; corrige la plantilla.', solo: 'sa', grupo: 'Organización' },
  { ruta: 'departamentos', titulo: 'Departamentos', icono: 'building', desc: 'Plantilla por puesto y rate.', solo: 'encargado', grupo: 'Organización' },
  { ruta: 'ajustes', titulo: 'Ajustes', icono: 'gear', desc: 'Tus departamentos: créalos y carga su plantilla.', solo: 'gte', grupo: 'Organización' },
  { ruta: 'perfil', titulo: 'Perfil', icono: 'user', desc: 'Tus datos y contraseña.', grupo: 'Organización' },
]

// El super administrador solo administra: sus módulos y su perfil
const permitido = (m, user) =>
  user.role === 'sa' ? m.solo === 'sa' || m.ruta === 'perfil'
    : (!m.solo || (m.solo === 'gte' ? user.role === 'gte' : m.solo === 'encargado' && user.encargado)) && m.excepto !== user.role
export const modulosDe = (user) => MODULOS.filter((m) => permitido(m, user))

// Versión de las fotos de perfil en las direcciones: cambia al subir una nueva y así nadie ve la anterior en caché
let version = Date.now()
export const versionFotos = () => version
export const fotoCambiada = () => { version = Date.now() }

// Errores del navegador al log del servidor (/api/errores): se encuentran en Render sin pedir capturas
export function reportarError(e) {
  const err = e?.error ?? e?.reason ?? e
  fetch('/api/errores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mensaje: String(err?.message ?? err ?? 'sin mensaje').slice(0, 500), pila: String(err?.stack ?? '').slice(0, 4000), ruta: location.hash.slice(0, 200) }),
  }).catch(() => { /* sin red: no hay a quién avisar */ })
}

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
  if (data.otraCuenta) dispatchEvent(new Event('sesion-cambiada')) // App pasa a la cuenta de la cookie
  // Los errores propios de Fastify (validación del esquema, ruta inexistente) traen statusCode y un texto en inglés;
  // los de la app traen solo `error`, ya redactado para el usuario (en español: se traduce aquí)
  if (data.statusCode) throw new Error(t(res.status === 400 ? 'Revisa los datos ingresados.' : 'Ocurrió un error. Intenta de nuevo.'))
  // datos: banderas del servidor (confirmar: pide la contraseña del super administrador; debeCambiar…)
  throw Object.assign(new Error(t(data.error ?? 'Ocurrió un error. Intenta de nuevo.', data)), { datos: data })
}

// Fecha local en formato AAAA-MM-DD, el que usan los <input type="date">
export const hoy = () => new Date().toLocaleDateString('en-CA')
// Fecha y zona horaria del navegador: el servidor las usa para el rate de aprobación ("a tiempo" en tu hora local)
export const consultaRate = () => `hoy=${hoy()}&zona=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`
export const nombreTurno = (k) => t('Turno {n}', { n: NOMBRES_TURNO[k]?.[0] ?? k })
export const turnoLargo = (k) => (NOMBRES_TURNO[k] ? `${nombreTurno(k)} · ${t(NOMBRES_TURNO[k][1])}` : k)
// Fin del turno en la hora local: la próxima vez que llega su hora de salida (1: 15:00, 2: 22:30, 3: 07:00, 4: 17:30).
// Una tarea urgente se cierra en ese momento
export function finTurno(turno, ahora = new Date()) {
  const [h, m] = TURNOS[turno].split('–')[1].split(':').map(Number)
  const fin = new Date(ahora)
  fin.setHours(h, m, 0, 0)
  if (fin <= ahora) fin.setDate(fin.getDate() + 1)
  return fin
}
const aHoras = (txt) => { const [h, m] = txt.split(':').map(Number); return h + m / 60 }
// Inicio y fin de cada turno en horas; el 3 (C) cruza la medianoche. El administrativo (D) se cruza con los otros:
// el reloj lo dibuja aparte y "el turno de ahora" es siempre uno de los tres rotativos
export const RANGOS = Object.fromEntries(Object.entries(TURNOS).filter(([k]) => k !== 'D').map(([k, v]) => {
  const [a, b] = v.split('–').map(aHoras)
  return [k, [a, b < a ? b + 24 : b]]
}))
export const turnoDe = (h) => Object.keys(RANGOS).find((k) => { const [a, b] = RANGOS[k]; return (h >= a && h < b) || (h + 24 >= a && h + 24 < b) })
export const horaActual = (d = new Date()) => d.getHours() + d.getMinutes() / 60
// Fin del turno que empieza en `fecha` (el 3 termina al día siguiente), en la hora local
export function cierreTurno(fecha, turno) {
  const fin = new Date(`${fecha}T${TURNOS[turno].split('–')[1]}`)
  if (turno === 'C') fin.setDate(fin.getDate() + 1)
  return fin
}
// 90 → "1:30"
export const horas = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`
// Marca de autoría: al pie de cada pantalla y de cada PDF (igual en ambos idiomas)
export const COPYRIGHT = '© Copyright 2026 IT Team GDL / MICHELL TOVAR Test Engineer Jr. All Rights Reserved.'
// Medianoche local de hoy como instante UTC: el servidor la usa para "lo realizado hoy"
export const inicioDeHoy = () => new Date(new Date().setHours(0, 0, 0, 0)).toISOString()

// % de actividades realizadas: ya no hay porcentaje por actividad, el estado manda (Realizada = hecha)
export const pctRealizadas = (actividades) =>
  actividades.length ? Math.round((actividades.filter((a) => a.status === 'done').length / actividades.length) * 100) : 0

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

// Excel ejecuta como fórmula una celda que empieza con = + - @; el apóstrofo la deja como texto
const celdaCsv = (v) => {
  const s = String(v ?? '')
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replaceAll('"', '""')}"`
}

export function descargarCsv(columnas, filas, nombre) {
  const csv = [columnas.map((c) => t(c)), ...filas].map((fila) => fila.map(celdaCsv).join(',')).join('\r\n')
  // El BOM hace que Excel lea los acentos como UTF-8
  descargar(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), nombre)
}

export function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

// "Chrome · Windows" a partir del user-agent que guardan los registros (la MAC no llega al servidor desde un navegador)
export function dispositivo(ua = '') {
  const nav = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null
  const so = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS'
    : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null
  return nav || so ? [nav, so].filter(Boolean).join(' · ') : ua.slice(0, 40) || '—'
}

// "hace 3 horas", "ayer", "in 2 days"… en el idioma actual
export function hace(iso, ahora = Date.now()) {
  const s = (Date.parse(iso) - ahora) / 1000
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' })
  for (const [unidad, n] of [['day', 86_400], ['hour', 3_600], ['minute', 60]]) if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), unidad)
  return rtf.format(0, 'minute')
}
