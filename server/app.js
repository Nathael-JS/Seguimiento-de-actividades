import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { existsSync, readFileSync } from 'node:fs'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'

const leer = (archivo) => JSON.parse(readFileSync(new URL(archivo, import.meta.url)))
const dist = new URL('../dist/', import.meta.url)

// Menor número = más rango. Encargados: Gerente, Senior, Ing. Full
const RANGO = { gte: 0, sr: 1, full: 2, jr: 3, tec: 4 }
const esEncargado = (u) => RANGO[u.role] <= 2
const ESTADOS = ['done', 'progress', 'pending', 'incomplete']

const noEmpleado = { type: 'string', pattern: '^\\d{1,10}$' }
const texto = (max) => ({ type: 'string', maxLength: max })
const porEmpleado = { params: { type: 'object', properties: { no: noEmpleado } } }
// Criticidad de una actividad diaria; la crítica va debajo de la urgente pero sí se hereda (ver /heredar)
const criticidad = { enum: ['simple', 'normal', 'alta', 'critica'] }
const PESO_CRITICIDAD = { simple: 0, normal: 1, alta: 2, critica: 3 }
// desde: inicio del día local de quien consulta (instante UTC). Con él solo se ven las abiertas y las realizadas hoy
// hoy: fecha local de quien consulta (AAAA-MM-DD); con ella se generan los avisos de atraso
// zona: zona horaria IANA del navegador (America/Mexico_City); con hoy, calcula el rate de aprobación
const consulta = {
  type: 'object',
  properties: {
    desde: { type: 'string', format: 'date-time' },
    hoy: { type: 'string', format: 'date' },
    zona: { type: 'string', maxLength: 64, pattern: '^[A-Za-z_+\\-/0-9]+$' },
  },
}
const conDesde = { ...porEmpleado, querystring: consulta }
const conRate = { querystring: consulta }
const notificacionSchema = { params: { type: 'object', properties: { no: noEmpleado, id: { type: 'integer', minimum: 1 } } } }
const token = { type: 'string', minLength: 1, maxLength: 64 }
// Mínimo 10 caracteres, mayúscula, minúscula, número y símbolo (las mismas reglas que muestra el frontend)
const passwordNueva = {
  type: 'string', minLength: 10, maxLength: 100,
  pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9])',
}
const claveDepto = { type: 'string', pattern: '^[a-z0-9-]{1,20}$' }
const objeto = (requeridos, properties) => ({ type: 'object', required: requeridos, additionalProperties: false, properties })

const crearDeptoSchema = { body: objeto(['por', 'nombre'], { por: noEmpleado, nombre: { type: 'string', minLength: 3, maxLength: 60, pattern: '\\S' } }) }
// Una fila por empleado; las reglas que dependen de otros (encargado, correo repetido) las revisa el servidor
const filaPlantilla = objeto(['no', 'name', 'email', 'role', 'shift', 'boss'], {
  no: { type: 'string', pattern: '^\\d{4,10}$' },
  name: { type: 'string', minLength: 3, maxLength: 100, pattern: '\\S' },
  email: { type: 'string', format: 'email', maxLength: 100 },
  role: { enum: ['tec', 'jr', 'full', 'sr'] },
  shift: { enum: ['A', 'B', 'C'] },
  area: { type: 'string', maxLength: 100 },
  boss: { type: 'string', pattern: '^\\d{1,10}$' },
})
const plantillaSchema = {
  params: { type: 'object', properties: { clave: claveDepto } },
  body: objeto(['por', 'filas'], {
    por: noEmpleado,
    filas: { type: 'array', minItems: 1, maxItems: 500, items: filaPlantilla },
    soloRevisar: { type: 'boolean' },
  }),
}
const verificarSchema = { body: objeto(['token', 'codigo'], { token, codigo: { type: 'string', pattern: '^\\d{6}$' } }) }
const registroSchema = {
  body: objeto(['name', 'no', 'email', 'role', 'dept', 'shift', 'password'], {
    name: { type: 'string', minLength: 3, maxLength: 100, pattern: '\\S' },
    no: { type: 'string', pattern: '^\\d{4,10}$' },
    email: { type: 'string', format: 'email', maxLength: 100 },
    role: { enum: ['tec', 'jr', 'full', 'sr', 'gte'] },
    dept: claveDepto,
    shift: { enum: ['A', 'B', 'C'] },
    boss: noEmpleado,
    area: { type: 'string', maxLength: 100 },
    password: passwordNueva,
  }),
}
const recuperarSchema = { body: objeto(['no', 'email'], { no: noEmpleado, email: { type: 'string', maxLength: 100 } }) }
const cambiarSchema = { body: objeto(['token', 'password'], { token, password: passwordNueva }) }
const cambiarPropiaSchema = { ...porEmpleado, body: objeto(['actual', 'nueva'], { actual: texto(100), nueva: passwordNueva }) }

const loginSchema = {
  body: {
    type: 'object',
    required: ['usuario', 'password'],
    additionalProperties: false,
    properties: {
      usuario: { type: 'string', minLength: 1, maxLength: 100, pattern: '\\S' },
      password: { type: 'string', minLength: 1, maxLength: 100 },
      // Acceso por el que entra: Gerencia (Gerente, Senior, Ing. Full) o Jr / Técnico
      tipo: { enum: ['gerencia', 'operativo'] },
    },
  },
}

const registrarSchema = {
  body: {
    type: 'object',
    required: ['por', 'para', 'fecha', 'turno', 'puntos'],
    additionalProperties: false,
    properties: {
      por: noEmpleado,
      para: noEmpleado,
      fecha: { type: 'string', format: 'date' },
      turno: { enum: ['A', 'B', 'C'] },
      puntos: {
        type: 'array',
        minItems: 1,
        maxItems: 20,
        items: {
          type: 'object',
          required: ['texto', 'avance'],
          additionalProperties: false,
          properties: {
            texto: { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' },
            avance: { type: 'integer', minimum: 0, maximum: 100 },
          },
        },
      },
      comentario: texto(500),
      // Diaria (estándar) o urgente; la urgente trae el fin del turno elegido, en la hora del navegador
      prioridad: { enum: ['diaria', 'urgente'] },
      criticidad,
      cierre: { type: 'string', format: 'date-time' },
    },
  },
}

const actualizarSchema = {
  params: { type: 'object', properties: { id: { type: 'integer', minimum: 1 } } },
  body: {
    type: 'object',
    required: ['por', 'estado', 'avance'],
    additionalProperties: false,
    properties: {
      por: noEmpleado,
      estado: { enum: ESTADOS },
      avance: { type: 'integer', minimum: 0, maximum: 100 },
      nota: texto(500),
    },
  },
}

// Tarea que registra el propio técnico / Ing. Jr. cierre: fin de su turno (instante UTC calculado en su navegador)
const propiaSchema = {
  body: objeto(['por', 'texto', 'prioridad', 'avance', 'hoy'], {
    por: noEmpleado,
    texto: { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' },
    prioridad: { enum: ['diaria', 'urgente'] },
    criticidad,
    avance: { type: 'integer', minimum: 0, maximum: 100 },
    hoy: { type: 'string', format: 'date' },
    cierre: { type: 'string', format: 'date-time' },
  }),
}

const comentario = { type: 'string', minLength: 1, maxLength: 300, pattern: '\\S' }
const responderSchema = {
  params: { type: 'object', properties: { id: { type: 'integer', minimum: 1 } } },
  body: objeto(['por', 'accion', 'hoy'], {
    por: noEmpleado, accion: { enum: ['aceptar', 'rechazar', 'redirigir'] }, comentario, para: noEmpleado,
    hoy: { type: 'string', format: 'date' },
  }),
}
const heredarSchema = {
  params: { type: 'object', properties: { id: { type: 'integer', minimum: 1 } } },
  body: {
    type: 'object',
    required: ['por', 'para', 'hoy', 'motivo'],
    additionalProperties: false,
    // hoy: la fecha local de quien hereda; la del servidor es UTC y de noche ya es mañana en México
    properties: { por: noEmpleado, para: noEmpleado, hoy: { type: 'string', format: 'date' }, motivo: comentario },
  },
}

const fechaSchema = { type: 'string', format: 'date' }
const matrizSchema = {
  ...porEmpleado,
  querystring: objeto(['desde', 'hasta', 'hoy'], { desde: fechaSchema, hasta: fechaSchema, hoy: fechaSchema }),
}
const reporteSchema = {
  body: {
    type: 'object',
    required: ['por', 'empleados', 'desde', 'hasta'],
    additionalProperties: false,
    properties: {
      por: noEmpleado,
      empleados: { type: 'array', minItems: 1, maxItems: 500, uniqueItems: true, items: noEmpleado },
      desde: { type: 'string', format: 'date' },
      hasta: { type: 'string', format: 'date' },
      turno: { enum: ['A', 'B', 'C'] },
    },
  },
}

// Instante exacto en UTC; cada navegador lo muestra en su hora local
const ahora = () => new Date().toISOString()
const DIA = 86_400_000
const VIGENCIA_PASSWORD = 90 // días
// Fecha del navegador aceptable: a un día o menos de la del servidor (cubre cualquier zona horaria)
const hoyValido = (hoy) => Math.abs(Date.parse(hoy) - Date.parse(new Date().toISOString().slice(0, 10))) <= DIA
const diasPassword = (u) => VIGENCIA_PASSWORD - Math.floor((Date.now() - Date.parse(u.pwdChanged)) / DIA)

// MFA con app autenticadora (TOTP, RFC 6238): HMAC-SHA1 del paso de 30 s, 6 dígitos. La clave va en base32,
// que es como la leen Google / Microsoft Authenticator
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const aBase32 = (buf) => [...buf].map((b) => b.toString(2).padStart(8, '0')).join('').match(/.{5}/g)
  .map((bits) => BASE32[parseInt(bits, 2)]).join('') // 20 bytes = 160 bits = 32 caracteres exactos
const deBase32 = (s) => Buffer.from([...s].map((c) => BASE32.indexOf(c).toString(2).padStart(5, '0')).join('')
  .match(/.{8}/g).map((bits) => parseInt(bits, 2)))
const pasoActual = () => Math.floor(Date.now() / 30_000)
export function totp(secreto, paso = pasoActual()) {
  const contador = Buffer.alloc(8)
  contador.writeBigUInt64BE(BigInt(paso))
  const h = createHmac('sha1', deBase32(secreto)).update(contador).digest()
  return String((h.readUInt32BE(h[19] & 0xf) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}
// Paso del código si es válido: se tolera ±30 s de desfase del reloj del teléfono y un código ya usado no se
// acepta otra vez (alguien que lo vea en pantalla no puede reutilizarlo)
const pasoDelCodigo = (secreto, codigo, ultimo = -1) =>
  [pasoActual() - 1, pasoActual(), pasoActual() + 1].find((p) => p > ultimo && totp(secreto, p) === codigo)
const APP_MFA = 'Seguimiento de Actividades'
const SIGUIENTE_TURNO = { A: 'B', B: 'C', C: 'A' }
// Fin de cada turno en minutos desde la medianoche del día en que empieza (el C termina al día siguiente)
const FIN_TURNO = { A: 14 * 60 + 30, B: 23 * 60, C: 30 * 60 }
const minutos = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))
// Minutos que salió después del fin de su turno; la salida antes de la entrada es del día siguiente
const tiempoExtra = ({ entrada, salida }, turno) =>
  Math.max(0, minutos(salida) + (salida < entrada ? 1440 : 0) - FIN_TURNO[turno])
const diaHabil = (fecha) => new Date(fecha).getUTCDay() % 6 !== 0 // lunes a viernes
// Fechas AAAA-MM-DD se leen como medianoche UTC, así que sumar 24 h nunca salta ni repite un día
const sumarDias = (fecha, n) => new Date(Date.parse(fecha) + n * 86_400_000).toISOString().slice(0, 10)
const diaSiguiente = (fecha) => sumarDias(fecha, 1)
const zonaValida = (zona) => {
  try { return !!new Intl.DateTimeFormat('en', { timeZone: zona }) } catch { return false }
}

export function build(opts = {}) {
  const app = Fastify(opts)

  // shortcut: datos de prueba en memoria (cada arranque vuelve a los JSON) y contraseñas en texto plano;
  // cambiar a PostgreSQL + hash cuando se retome la base de datos
  const usuarios = leer('./usuarios.json')
  const actividades = leer('./actividades.json')
  const notificaciones = leer('./notificaciones.json')
  const herencias = [] // propuestas de herencia: pendientes de validar y su historial
  // Los de los mockups y los que crea un gerente, que queda como quien lo dirige
  const departamentos = [
    { clave: 'lc', nombre: 'Liquid Cooling', gerente: '10001' },
    { clave: 'pf', nombre: 'Pruebas Funcionales', gerente: '10700' },
    { clave: 'smt', nombre: 'SMT', gerente: null },
  ]
  // shortcut: checador simulado (entrada/salida en hora de planta, lunes a viernes, oct–dic 2026); cambiar por el real
  const checador = leer('./checador.json')
  // Códigos de verificación y permisos de recuperación pendientes, por token
  const verificaciones = new Map()
  const recuperaciones = new Map()
  const limpiarVencidos = (mapa) => mapa.forEach((v, k) => v.vence < Date.now() && mapa.delete(k))
  const siguienteId = (lista) => Math.max(0, ...lista.map((x) => x.id)) + 1

  const empleado = (no) => usuarios.find((u) => u.no === no)
  // Acepta correo completo, la parte antes de la @ o el número de empleado
  const buscar = (id) =>
    usuarios.find((u) => u.email === id || u.email.split('@')[0] === id || u.no === id)
  // Departamentos de alguien: el suyo y los que dirige como gerente
  const deptosDe = (no) => [...new Set([empleado(no)?.dept, ...departamentos.filter((d) => d.gerente === no).map((d) => d.clave)])]
  // Todos los empleados debajo de `no` en la jerarquía, directos e indirectos; nunca de un departamento ajeno
  const equipo = (no, depts = deptosDe(no)) =>
    usuarios.filter((u) => u.boss === no && depts.includes(u.dept)).flatMap((u) => [u, ...equipo(u.no, depts)])
  // A quién puede asignar un encargado: su equipo, solo con menor rango que él
  const asignables = (u) => equipo(u.no).filter((e) => RANGO[e.role] > RANGO[u.role])
  // Una actividad heredada queda en el historial (reportes) pero sale de listas e indicadores
  const vigentes = () => actividades.filter((a) => !a.handedTo)
  // Lo del turno: lo que sigue abierto y lo realizado desde `desde`. Sin `desde`, todo
  // Avisos automáticos, una sola vez cada uno:
  // - actividad pendiente o en proceso con fecha anterior a hoy → al ejecutor y a quien la asignó
  // - contraseña que vence en 15 días o menos → a su dueño (otra vez solo si la cambia y vuelve a acercarse)
  // shortcut: se generan al consultar Inicio porque no hay tareas programadas; pasar a un job con la base de datos
  const generarAvisos = (hoy) => {
    for (const a of vigentes()) {
      // Misma regla de "atrasada" que src/tablero.js (Inicio del gerente): si cambia una, cambiar la otra
      if (a.avisoAtraso || (a.status !== 'pending' && a.status !== 'progress') || a.date >= hoy) continue
      a.avisoAtraso = true
      notificar({ for: a.to, kind: 'overdue', ref: a.id })
      notificar({ for: responsable(a), kind: 'overdue', who: a.to, ref: a.id })
    }
    for (const u of usuarios) {
      const dias = diasPassword(u)
      if (dias > 15 || u.avisoPassword === u.pwdChanged) continue
      u.avisoPassword = u.pwdChanged
      notificar({ for: u.no, kind: 'password', count: Math.max(dias, 0) })
    }
  }
  // Al cambiar la contraseña el aviso de "vence en N días" ya no aplica: se marca como leído, y se cierran
  // las demás sesiones abiertas de esa persona (conservar: la sesión desde la que la cambió, si la hay)
  const cambiarPassword = (u, password, conservar) => {
    Object.assign(u, { password, pwdChanged: ahora() })
    notificaciones.filter((n) => n.for === u.no && n.kind === 'password').forEach((n) => (n.read = true))
    sesiones.forEach((s, token) => s.no === u.no && token !== conservar && sesiones.delete(token))
  }
  const urgenteAbierta = (a) => a.prioridad === 'urgente' && !a.cerrada && a.status !== 'done'
  const delTurno = (acts, desde) =>
    desde ? acts.filter((a) => a.status !== 'done' || Date.parse(a.doneAt ?? a.at) >= Date.parse(desde)) : acts
  const notificar = (n) => notificaciones.push({ id: siguienteId(notificaciones), at: ahora(), read: false, ...n })
  // A quién se avisa de una actividad: quien la asignó, o el encargado del empleado si la registró él mismo
  const responsable = (a) => (a.propia ? empleado(a.to).boss : a.by)
  // Validación de fin de turno: una urgente que llegó a su cierre queda fija en su estado (sin cambios ni herencia);
  // si no llegó al 100 % queda incompleta y se avisa al empleado y a su encargado.
  // shortcut: se revisa en cada petición porque no hay tareas programadas; pasar a un job con la base de datos
  const cerrarUrgentes = () => {
    for (const a of actividades) {
      if (a.prioridad !== 'urgente' || a.cerrada || Date.now() < Date.parse(a.cierreTurno)) continue
      a.cerrada = true
      if (a.status === 'done') continue
      a.status = 'incomplete'
      notificar({ for: a.to, kind: 'urgent-closed', ref: a.id })
      notificar({ for: responsable(a), kind: 'urgent-closed', who: a.to, ref: a.id })
    }
  }
  app.addHook('onRequest', async () => cerrarUrgentes())

  const conEmpleado = (handler) => async (req, reply) => {
    const u = empleado(req.params.no)
    if (!u) return reply.code(404).send({ error: 'Empleado no encontrado.' })
    return handler(u, req, reply)
  }

  const sesion = (u) => ({ no: u.no, name: u.name, role: u.role, dept: u.dept, shift: u.shift, area: u.area, encargado: esEncargado(u) })

  // Sesiones: token aleatorio en una cookie HttpOnly (el JavaScript de la página no la puede leer) y SameSite=Strict
  // (otros sitios no la mandan). Sin Max-Age: se borra al cerrar el navegador, útil en equipos compartidos de planta.
  // shortcut: viven en memoria y se pierden al reiniciar el servidor; pasarlas a la base de datos cuando se retome
  const sesiones = new Map()
  const DURACION_SESION = 12 * 3_600_000 // sin actividad; se renueva con cada uso
  const tokenDe = (req) => req.headers.cookie?.match(/(?:^|;\s*)sesion=([^;]+)/)?.[1]
  const cookie = (req, valor, extra = '') =>
    `sesion=${valor}; HttpOnly; SameSite=Strict; Path=/${req.protocol === 'https' ? '; Secure' : ''}${extra}`
  const PUBLICAS = new Set([
    '/api/login', '/api/login/verificar', '/api/logout',
    '/api/registro', '/api/recuperar', '/api/recuperar/cambiar', '/api/encargados', '/api/deptos',
  ])
  const abrirSesion = (req, reply, u) => {
    limpiarVencidos(sesiones)
    const id = randomUUID()
    sesiones.set(id, { no: u.no, vence: Date.now() + DURACION_SESION })
    reply.header('set-cookie', cookie(req, id))
    return sesion(u)
  }
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/') || PUBLICAS.has(req.routeOptions.url)) return
    const s = sesiones.get(tokenDe(req))
    if (!s || s.vence < Date.now() || !empleado(s.no)) {
      return reply.code(401).send({ error: 'Tu sesión terminó. Vuelve a iniciar sesión.', sesion: false })
    }
    s.vence = Date.now() + DURACION_SESION
    req.sesion = s
    // El número que manda el navegador (en la dirección o en "por") tiene que ser el de la sesión
    const quien = req.params?.no ?? req.body?.por
    if (quien && quien !== s.no) return reply.code(403).send({ error: 'Solo puedes actuar con tu propia cuenta.' })
  })

  // Paso 1: usuario y contraseña. Si son correctos se genera el código del paso 2
  app.post('/api/login', { schema: loginSchema }, async (req, reply) => {
    const u = buscar(req.body.usuario.trim().toLowerCase())
    if (!u || !u.password || u.password !== req.body.password) {
      return reply.code(401).send({ error: 'Usuario o contraseña incorrectos.' })
    }
    const { tipo } = req.body
    if (tipo && (tipo === 'gerencia') !== esEncargado(u)) {
      return reply.code(403).send({ error: esEncargado(u) ? 'Esta cuenta es de Gerencia: entra por ese acceso.' : 'Esta cuenta es de Jr / Técnico: entra por ese acceso.' })
    }
    // shortcut: las cuentas de prueba (datos de los mockups) entran sin el código de la app para revisiones rápidas;
    // quitar "prueba" de usuarios.json cuando haya usuarios reales
    if (u.prueba) return abrirSesion(req, reply, u) // sin token: ya es la sesión
    limpiarVencidos(verificaciones)
    const id = randomUUID()
    // Primera vez: se genera la clave de su app autenticadora y queda guardada al verificar el primer código.
    // shortcut: el alta va con la contraseña como único respaldo (como en la mayoría de los sistemas internos);
    // agregar códigos de respaldo y que un administrador pueda reiniciar el MFA si alguien pierde el teléfono
    const alta = !u.totp && aBase32(randomBytes(20))
    verificaciones.set(id, { no: u.no, intentos: 0, vence: Date.now() + 5 * 60_000, ...(alta && { alta }) })
    if (!alta) return { token: id }
    const cuenta = encodeURIComponent(`${APP_MFA}:${u.email}`)
    return { token: id, secreto: alta, uri: `otpauth://totp/${cuenta}?secret=${alta}&issuer=${encodeURIComponent(APP_MFA)}` }
  })

  // Paso 2: el código de 6 dígitos. Expira a los 5 minutos y admite 5 intentos
  app.post('/api/login/verificar', { schema: verificarSchema }, async (req, reply) => {
    const v = verificaciones.get(req.body.token)
    if (!v || v.vence < Date.now()) {
      verificaciones.delete(req.body.token)
      return reply.code(401).send({ error: 'El código expiró. Vuelve a iniciar sesión.' })
    }
    const u = empleado(v.no)
    const paso = pasoDelCodigo(v.alta ?? u.totp, req.body.codigo, u.totpPaso)
    if (paso === undefined) {
      if (++v.intentos >= 5) {
        verificaciones.delete(req.body.token)
        return reply.code(401).send({ error: 'Demasiados intentos. Vuelve a iniciar sesión.' })
      }
      return reply.code(401).send({ error: 'Código incorrecto.' })
    }
    verificaciones.delete(req.body.token)
    Object.assign(u, { totpPaso: paso }, v.alta && { totp: v.alta })
    return abrirSesion(req, reply, u)
  })

  // Al recargar la página: quién es la sesión de esta cookie
  app.get('/api/sesion', async (req) => sesion(empleado(req.sesion.no)))

  app.post('/api/logout', async (req, reply) => {
    sesiones.delete(tokenDe(req))
    reply.header('set-cookie', cookie(req, '', '; Max-Age=0'))
    return { ok: true }
  })

  app.post('/api/registro', { schema: registroSchema }, async (req, reply) => {
    const { name, no, role, dept, shift, boss, area = '', password } = req.body
    const email = req.body.email.trim().toLowerCase()
    if (empleado(no)) return reply.code(409).send({ error: 'Ese número de empleado ya está registrado.' })
    if (usuarios.some((u) => u.email === email)) return reply.code(409).send({ error: 'Ese correo ya está registrado.' })

    if (!departamentos.some((d) => d.clave === dept)) return reply.code(400).send({ error: 'Ese departamento no existe.' })
    const nuevo = { no, name: name.trim(), role, dept, shift, email, pwdChanged: ahora(), password }
    if (RANGO[role] <= 2) {
      // Encargado: indica su área; no elige jefe (como en el mockup)
      if (!area.trim()) return reply.code(400).send({ error: 'Escribe tu área dentro del departamento.' })
      Object.assign(nuevo, { boss: null, area: area.trim() })
    } else {
      // Técnico / Ing. Jr: elige a su encargado del mismo departamento y hereda su área
      const jefe = boss && empleado(boss)
      if (!jefe || !esEncargado(jefe) || !deptosDe(jefe.no).includes(dept)) {
        return reply.code(400).send({ error: 'Elige a tu encargado del departamento.' })
      }
      Object.assign(nuevo, { boss, area: jefe.area })
    }
    usuarios.push(nuevo)
    return reply.code(201).send({ ok: true })
  })

  app.post('/api/recuperar', { schema: recuperarSchema }, async (req, reply) => {
    const u = empleado(req.body.no)
    if (!u || u.email !== req.body.email.trim().toLowerCase()) {
      return reply.code(400).send({ error: 'Número de empleado y correo no coinciden con un registro.' })
    }
    limpiarVencidos(recuperaciones)
    const id = randomUUID()
    recuperaciones.set(id, { no: u.no, vence: Date.now() + 15 * 60_000 })
    return { token: id, name: u.name, no: u.no, email: u.email }
  })

  app.post('/api/recuperar/cambiar', { schema: cambiarSchema }, async (req, reply) => {
    const r = recuperaciones.get(req.body.token)
    recuperaciones.delete(req.body.token) // un solo uso
    if (!r || r.vence < Date.now()) return reply.code(401).send({ error: 'El permiso expiró. Vuelve a validar tus datos.' })
    cambiarPassword(empleado(r.no), req.body.password)
    return { ok: true }
  })

  // Rate de aprobación: % de las actividades de los últimos 30 días realizadas a tiempo, es decir a más tardar el
  // día que les tocaba (en la hora local de quien consulta). Las de hoy que siguen abiertas aún no cuentan;
  // una heredada a otro cuenta como no realizada por quien la tenía. null: sin actividades en el periodo
  const rateDe = (no, { hoy, zona }) => {
    const desde = sumarDias(hoy, -30)
    const cuentan = actividades.filter((a) =>
      a.to === no && a.date >= desde && a.date <= hoy && (a.status === 'done' || a.date < hoy))
    if (!cuentan.length) return null
    const diaLocal = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: zona })
    const aTiempo = cuentan.filter((a) => a.status === 'done' && diaLocal(a.doneAt ?? a.at) <= a.date)
    return Math.round((aTiempo.length / cuentan.length) * 100)
  }
  // Con hoy y zona válidos se agrega el rate; sin ellos no (Registro, Registrar actividad, Reportes no lo usan)
  const conRateDe = (query) => (query.hoy && query.zona ? (no) => ({ rate: rateDe(no, query) }) : () => ({}))
  app.addHook('preHandler', async (req, reply) => {
    if (req.query?.zona && !zonaValida(req.query.zona)) return reply.code(400).send({ error: 'Zona horaria no válida.' })
  })

  // Registro (sin sesión): a quién se puede elegir como encargado
  app.get('/api/encargados', async () =>
    usuarios.filter(esEncargado).sort((a, b) => RANGO[a.role] - RANGO[b.role] || a.name.localeCompare(b.name))
      .map(({ no, name, role }) => ({ no, name, role, depts: deptosDe(no) })))

  // Catálogo de departamentos (Registro, sin sesión)
  app.get('/api/deptos', async () => departamentos.map(({ clave, nombre, gerente }) => ({ clave, nombre, gerente })))

  // La plantilla de los departamentos de quien consulta (el suyo y los que dirige): ningún departamento ve a otro
  app.get('/api/departamentos', { schema: conRate }, async (req) => {
    const rate = conRateDe(req.query)
    const depts = deptosDe(req.sesion.no)
    return usuarios
      .filter((u) => depts.includes(u.dept))
      .map(({ no, name, role, dept, shift, area }) => ({ no, name, role, dept, shift, area, ...rate(no) }))
      .sort((a, b) => RANGO[a.role] - RANGO[b.role] || a.name.localeCompare(b.name))
  })

  // Un gerente crea un departamento y queda como quien lo dirige
  app.post('/api/departamentos', { schema: crearDeptoSchema }, async (req, reply) => {
    const yo = empleado(req.body.por)
    if (yo?.role !== 'gte') return reply.code(403).send({ error: 'Solo un gerente crea departamentos.' })
    const nombre = req.body.nombre.trim().replace(/\s+/g, ' ')
    if (departamentos.some((d) => d.nombre.toLowerCase() === nombre.toLowerCase())) {
      return reply.code(409).send({ error: 'Ya existe un departamento con ese nombre.' })
    }
    // Clave legible a partir del nombre ("Calidad de Proceso" → calidad-de-proce), única
    const base = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 16) || 'depto'
    let clave = base
    for (let i = 2; departamentos.some((d) => d.clave === clave); i++) clave = `${base.slice(0, 16)}-${i}`
    const d = { clave, nombre, gerente: yo.no }
    departamentos.push(d)
    return reply.code(201).send({ clave, nombre })
  })

  // Plantilla del departamento: el gerente sube a su gente (Excel o CSV, leído en el navegador) y aquí se valida
  // todo junto; si una fila tiene error no se guarda nada. Con soloRevisar solo responde qué haría cada fila.
  // Las personas nuevas no tienen contraseña: la crean con "¿Olvidaste tu contraseña?" (número y correo)
  app.post('/api/departamentos/:clave/plantilla', { schema: plantillaSchema }, async (req, reply) => {
    const { clave } = req.params
    const { por, filas, soloRevisar } = req.body
    const yo = empleado(por)
    if (yo?.role !== 'gte' || !deptosDe(por).includes(clave)) {
      return reply.code(403).send({ error: 'Solo el gerente que dirige el departamento carga su plantilla.' })
    }
    const enArchivo = new Map(filas.map((f) => [f.no, f]))
    const resultado = filas.map((f, i) => {
      const actual = empleado(f.no)
      const jefe = enArchivo.get(f.boss) ?? empleado(f.boss) // puede venir en el mismo archivo
      const jefeDelDepto = jefe && (f.boss === por || enArchivo.has(f.boss) || jefe.dept === clave)
      // Siempre a cargo de alguien de mayor puesto, y sin dejar a nadie a cargo de alguien de igual o menor
      // puesto: así la jerarquía nunca hace ciclos
      const rangoOk = jefe && RANGO[jefe.role] <= 2 && RANGO[jefe.role] < RANGO[f.role] &&
        usuarios.every((u) => u.boss !== f.no || enArchivo.has(u.no) || RANGO[u.role] > RANGO[f.role])
      const error =
        filas.findIndex((x) => x.no === f.no) !== i ? 'Número repetido en el archivo.'
          : f.no === por ? 'Tú no vas en la plantilla: ya diriges el departamento.'
          : actual && actual.dept !== clave ? 'Ese número es de otro departamento.'
          : usuarios.some((u) => u.email === f.email.trim().toLowerCase() && u.no !== f.no) ||
            filas.findIndex((x) => x.email.trim().toLowerCase() === f.email.trim().toLowerCase()) !== i ? 'Ese correo ya lo usa otra persona.'
          : !jefeDelDepto ? 'El encargado no existe en este departamento.'
          : !rangoOk ? 'El encargado debe ser Ing. Full, Senior o Gerente, de mayor puesto que la persona.'
          : null
      return { no: f.no, name: f.name, accion: actual ? 'actualizar' : 'crear', error }
    })
    const conError = resultado.filter((r) => r.error).length
    if (soloRevisar || conError) return reply.code(conError && !soloRevisar ? 400 : 200).send({ filas: resultado, conError })
    for (const f of filas) {
      const datos = { name: f.name.trim(), email: f.email.trim().toLowerCase(), role: f.role, shift: f.shift, boss: f.boss, dept: clave }
      const actual = empleado(f.no)
      if (actual) Object.assign(actual, datos, f.area?.trim() && { area: f.area.trim() })
      else usuarios.push({ no: f.no, ...datos, area: f.area?.trim() || '', pwdChanged: ahora(), password: null })
    }
    // El área vacía se hereda del encargado, ya con todos guardados
    for (const f of filas) { const u = empleado(f.no); if (!u.area) u.area = empleado(u.boss)?.area ?? '' }
    return { filas: resultado, conError: 0, creados: resultado.filter((r) => r.accion === 'crear').length, actualizados: resultado.filter((r) => r.accion === 'actualizar').length }
  })

  app.get('/api/perfil/:no', { schema: { ...porEmpleado, querystring: consulta } }, conEmpleado((u, req) => {
    const { no, name, role, dept, shift, area, email, pwdChanged, boss } = u
    return {
      no, name, role, dept, shift, area, email, pwdChanged, ...conRateDe(req.query)(no),
      bossName: empleado(boss)?.name, bossRole: empleado(boss)?.role, diasPassword: diasPassword(u),
    }
  }))

  app.post('/api/perfil/:no/password', { schema: cambiarPropiaSchema }, conEmpleado((u, req, reply) => {
    if (req.body.actual !== u.password) return reply.code(401).send({ error: 'La contraseña actual no es correcta.' })
    if (req.body.nueva === u.password) return reply.code(400).send({ error: 'La nueva contraseña debe ser distinta de la actual.' })
    cambiarPassword(u, req.body.nueva, tokenDe(req))
    return { ok: true }
  }))

  app.get('/api/inicio/:no', { schema: conDesde }, conEmpleado((u, req) => {
    // Un reloj mal puesto en el navegador marcaría como atrasado todo y avisaría a todos, sin vuelta atrás:
    // solo se aceptan fechas a un día o menos de la del servidor (cubre cualquier zona horaria)
    if (req.query.hoy && hoyValido(req.query.hoy)) generarAvisos(req.query.hoy)
    // El encargado ve las suyas y las de su equipo; el ejecutor, solo las suyas
    const alcance = esEncargado(u) ? [u.no, ...equipo(u.no).map((e) => e.no)] : [u.no]
    const acts = delTurno(vigentes().filter((a) => alcance.includes(a.to)), req.query.desde)
    return {
      diasPassword: diasPassword(u),
      asignadas: acts.length,
      realizadas: acts.filter((a) => a.status === 'done').length,
      abiertas: acts.filter((a) => a.status === 'pending' || a.status === 'incomplete').length,
      avance: acts.length ? Math.round(acts.reduce((s, a) => s + a.pct, 0) / acts.length) : null, // null: sin actividades
      notificaciones: notificaciones
        .filter((n) => n.for === u.no)
        // Por fecha y no por id: el Buzón agrupa por día y los datos pueden llegar fuera de orden
        .sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id)
        .map((n) => {
          const a = actividades.find((x) => x.id === n.ref)
          return {
            id: n.id,
            kind: n.kind,
            who: empleado(n.who)?.name,
            actividad: a?.text,
            activityTo: a?.to, // de quién es la actividad: decide si se abre Mis actividades o Monitoreo
            urgente: a?.prioridad === 'urgente',
            count: n.count,
            at: n.at,
            read: n.read,
          }
        }),
    }
  }))

  app.post('/api/notificaciones/:no/leidas', { schema: porEmpleado }, conEmpleado((u) => {
    notificaciones.filter((n) => n.for === u.no).forEach((n) => (n.read = true))
    return { ok: true }
  }))

  app.post('/api/notificaciones/:no/:id/leida', { schema: notificacionSchema }, async (req, reply) => {
    const n = notificaciones.find((x) => x.id === req.params.id && x.for === req.params.no)
    if (!n) return reply.code(404).send({ error: 'Notificación no encontrada.' })
    n.read = true
    return { ok: true }
  })

  // Equipo del encargado con sus actividades vigentes: alimenta Registrar, herencia, Monitoreo y Reportes
  app.get('/api/equipo/:no', { schema: conDesde }, conEmpleado((u, req, reply) => {
    if (!esEncargado(u)) return reply.code(403).send({ error: 'Solo los encargados ven a su equipo.' })
    const acts = delTurno(vigentes(), req.query.desde)
    const rate = conRateDe(req.query)
    return asignables(u)
      .sort((a, b) => RANGO[a.role] - RANGO[b.role] || a.name.localeCompare(b.name))
      .map(({ no, name, role, dept, shift, boss }) => ({
        no, name, role, dept, shift, boss, ...rate(no),
        actividades: acts.filter((a) => a.to === no).sort((a, b) => b.id - a.id),
      }))
  }))

  app.post('/api/actividades', { schema: registrarSchema }, async (req, reply) => {
    const { por, para, fecha, turno, puntos, comentario = '', prioridad, cierre, criticidad = 'normal' } = req.body
    const encargado = empleado(por)
    if (!encargado || !esEncargado(encargado)) {
      return reply.code(403).send({ error: 'Solo los encargados registran actividades.' })
    }
    if (!asignables(encargado).some((e) => e.no === para)) {
      return reply.code(403).send({ error: 'Ese empleado no está a tu cargo.' })
    }
    // Una urgente es para el turno en curso o el siguiente: se cierra dentro de las próximas 24 h
    const espera = Date.parse(cierre) - Date.now()
    if (prioridad === 'urgente' && !(espera > 0 && espera <= DIA)) {
      return reply.code(400).send({ error: 'Una urgente es para el turno en curso o el siguiente: revisa la fecha y el turno.' })
    }
    const at = ahora()
    const nuevas = puntos.map((p) => {
      const a = {
        id: siguienteId(actividades), to: para, by: por, date: fecha, shift: turno, at,
        text: p.texto.trim(), pct: p.avance, status: p.avance === 100 ? 'done' : p.avance > 0 ? 'progress' : 'pending',
        mgr: comentario.trim(), note: '', ...(p.avance === 100 && { doneAt: at }),
        ...(prioridad === 'urgente' ? { prioridad, cierreTurno: cierre } : { criticidad }),
      }
      actividades.push(a)
      return a
    })
    notificar({ for: para, kind: 'assigned', who: por, count: nuevas.length })
    return reply.code(201).send(nuevas)
  })

  // El técnico / Ing. Jr agrega una tarea suya: se toman sus datos tal cual (él mismo, su turno, la fecha de hoy)
  app.post('/api/actividades/propia', { schema: propiaSchema }, async (req, reply) => {
    const { por, texto, prioridad, avance, hoy, cierre, criticidad = 'normal' } = req.body
    const u = empleado(por)
    if (!u || esEncargado(u)) return reply.code(403).send({ error: 'Solo técnicos e Ing. Jr agregan tareas propias.' })
    if (!hoyValido(hoy)) return reply.code(400).send({ error: 'Revisa la fecha de tu equipo.' })
    // La urgente se cierra al terminar el turno: debe llegar el cierre y estar dentro de las próximas 24 h
    const espera = Date.parse(cierre) - Date.now()
    if (prioridad === 'urgente' && !(espera > 0 && espera <= DIA)) {
      return reply.code(400).send({ error: 'No se pudo calcular el fin de tu turno.' })
    }
    const at = ahora()
    const a = {
      id: siguienteId(actividades), to: u.no, by: u.no, date: hoy, shift: u.shift, at, text: texto.trim(),
      pct: avance, status: avance === 100 ? 'done' : avance > 0 ? 'progress' : 'pending', mgr: '', note: '',
      propia: true, prioridad, ...(prioridad === 'urgente' ? { cierreTurno: cierre } : { criticidad }), ...(avance === 100 && { doneAt: at }),
    }
    actividades.push(a)
    if (u.boss) notificar({ for: u.boss, kind: 'propia', who: u.no, ref: a.id })
    return reply.code(201).send(a)
  })

  app.get('/api/actividades/:no', { schema: porEmpleado }, conEmpleado((u) =>
    vigentes()
      .filter((a) => a.to === u.no)
      // Primero las urgentes abiertas, las realizadas al final; luego por criticidad y la más nueva primero
      .sort((a, b) => urgenteAbierta(b) - urgenteAbierta(a) || (a.status === 'done') - (b.status === 'done') ||
        PESO_CRITICIDAD[b.criticidad ?? 'normal'] - PESO_CRITICIDAD[a.criticidad ?? 'normal'] || b.id - a.id)
      .map((a) => ({ ...a, byName: empleado(a.by)?.name })),
  ))

  app.patch('/api/actividades/:id', { schema: actualizarSchema }, async (req, reply) => {
    const a = actividades.find((x) => x.id === req.params.id)
    if (!a) return reply.code(404).send({ error: 'Actividad no encontrada.' })
    const { por, avance, nota = a.note } = req.body
    // 100 % es Realizada (como al registrar) y Realizada es 100 %
    const estado = avance === 100 ? 'done' : req.body.estado
    if (a.to !== por) return reply.code(403).send({ error: 'Solo quien tiene asignada la actividad puede actualizarla.' })
    if (a.handedTo) return reply.code(409).send({ error: 'Esta actividad ya fue heredada a otro turno.' })
    if (a.cerrada) return reply.code(409).send({ error: 'Esta tarea urgente se cerró al terminar el turno.' })

    const cambioEstado = estado !== a.status
    const cambioNota = nota.trim() !== a.note
    // doneAt: cuándo quedó realizada; se conserva si ya lo estaba y se borra si se reabre
    Object.assign(a, {
      status: estado, pct: estado === 'done' ? 100 : avance, note: nota.trim(),
      doneAt: estado !== 'done' ? undefined : a.status === 'done' ? a.doneAt : ahora(),
    })
    // El encargado se entera del cambio de estado y del comentario por separado, como en el mockup
    if (cambioEstado) notificar({ for: responsable(a), kind: estado, who: por, ref: a.id })
    if (cambioNota) notificar({ for: responsable(a), kind: 'comment', who: por, ref: a.id })
    return { ...a, byName: empleado(a.by)?.name }
  })

  // ── Herencia ─────────────────────────────────────────────────────────────────────────────────────────────
  // Un encargado (Ing. Full o superior) propone heredar una actividad pendiente o incompleta de su equipo, con
  // motivo, a alguien de cualquier departamento. La valida el encargado directo de quien la recibe: acepta,
  // rechaza o redirige a alguien de su equipo. Si quien propone ya es ese encargado, entra directo.
  // Límites por día (fecha local de quien actúa): 2 herencias por turno y 2 a otro departamento a quien propone,
  // 2 redirecciones a quien valida. La crítica pasa directo al siguiente turno una vez al día, sin límite.
  const LIMITE = 2
  const NIVEL = { tec: 'ejecutor', jr: 'ejecutor', full: 'lider', sr: 'lider', gte: 'lider' }
  // Verificación de quien recibe: cada condición es un sí/no y todas deben cumplirse
  const condiciones = (a, r) => ({
    puesto: NIVEL[r.role] === NIVEL[empleado(a.to).role], // técnico ↔ Ing. Jr, Ing. Full ↔ Senior
    turno: r.no === a.to || r.shift === SIGUIENTE_TURNO[a.shift], // el mismo empleado (día siguiente) u otro del turno siguiente
  })
  const puedeRecibir = (a, r) => Object.values(condiciones(a, r)).every(Boolean)
  const validadorDe = (r) => r.boss ?? r.no
  const cuenta = (filtro) => herencias.filter((h) => h.estado !== 'rechazada' && h.estado !== 'anulada' && filtro(h)).length
  const heredable = (a) => a.prioridad !== 'urgente' && !a.handedTo && (a.status === 'pending' || a.status === 'incomplete')

  // La actividad pasa a quien recibe. Mismo empleado: día siguiente, mismo turno. Otro: siguiente turno (tras el C
  // viene el A del día siguiente). Se cuenta desde hoy si es de días anteriores, para no crearla en el pasado
  const traspasar = (a, para, por, hoy) => {
    const mismo = para === a.to
    const base = a.date > hoy ? a.date : hoy
    const nueva = {
      ...a, id: siguienteId(actividades), to: para, by: por, at: ahora(), status: 'pending', note: '', inh: true,
      date: mismo || a.shift === 'C' ? diaSiguiente(base) : base,
      shift: mismo ? a.shift : SIGUIENTE_TURNO[a.shift],
      ...(a.criticidad === 'critica' && { pasadaEl: hoy }),
    }
    delete nueva.herencia
    actividades.push(nueva)
    a.handedTo = para
    delete a.herencia
    notificar({ for: para, kind: 'inherited', who: por, ref: nueva.id })
    return nueva
  }
  const vistaHerencia = (h) => {
    const a = actividades.find((x) => x.id === h.act)
    const nombre = (no) => empleado(no)?.name
    const persona = (no) => { const e = empleado(no); return e && { no, name: e.name, role: e.role, dept: e.dept, shift: e.shift } }
    return {
      ...h, de: persona(a.to), porName: nombre(h.por), validaName: nombre(h.valida),
      paraPersona: persona(h.para), redirigidaName: nombre(h.redirigidaA),
      actividad: { id: a.id, text: a.text, date: a.date, shift: a.shift, pct: a.pct, status: a.status, criticidad: a.criticidad ?? 'normal' },
    }
  }

  // Quiénes pueden recibir esta actividad (cualquier departamento), y quién validaría
  app.get('/api/actividades/:id/receptores', { schema: { params: heredarSchema.params } }, async (req, reply) => {
    const a = actividades.find((x) => x.id === req.params.id)
    const yo = empleado(req.sesion.no)
    if (!a || !esEncargado(yo) || !asignables(yo).some((e) => e.no === a.to)) {
      return reply.code(403).send({ error: 'Esa actividad no es de tu equipo.' })
    }
    return usuarios.filter((r) => puedeRecibir(a, r))
      .sort((x, y) => (x.no !== a.to) - (y.no !== a.to) || (x.dept !== yo.dept) - (y.dept !== yo.dept) || x.name.localeCompare(y.name))
      .map((r) => ({
        no: r.no, name: r.name, role: r.role, dept: r.dept, shift: r.shift, mismo: r.no === a.to,
        // null: entra directo (crítica, o quien propone ya es su encargado)
        valida: a.criticidad === 'critica' || validadorDe(r) === yo.no ? null : empleado(validadorDe(r))?.name,
      }))
  })

  app.post('/api/actividades/:id/heredar', { schema: heredarSchema }, async (req, reply) => {
    const a = actividades.find((x) => x.id === req.params.id)
    if (!a) return reply.code(404).send({ error: 'Actividad no encontrada.' })
    const { por, para, hoy, motivo } = req.body
    const yo = empleado(por)
    if (!yo || !esEncargado(yo) || !asignables(yo).some((e) => e.no === a.to)) {
      return reply.code(403).send({ error: 'Esa actividad no es de tu equipo.' })
    }
    if (!hoyValido(hoy)) return reply.code(400).send({ error: 'Revisa la fecha de tu equipo.' })
    if (a.prioridad === 'urgente') return reply.code(409).send({ error: 'Las tareas urgentes no se heredan.' })
    if (!heredable(a)) return reply.code(409).send({ error: 'Solo se heredan actividades pendientes o incompletas, una sola vez.' })
    if (a.herencia) return reply.code(409).send({ error: 'Esa actividad ya espera validación.' })
    const r = empleado(para)
    if (!r) return reply.code(404).send({ error: 'Empleado no encontrado.' })
    const ok = condiciones(a, r)
    if (!ok.puesto) return reply.code(400).send({ error: 'Solo se hereda entre puestos del mismo nivel: técnico e Ing. Jr, o Ing. Full y Senior.' })
    if (!ok.turno) return reply.code(400).send({ error: 'Quien recibe debe ser del turno siguiente (o el mismo empleado, al día siguiente).' })

    const critica = a.criticidad === 'critica'
    const cruzada = r.dept !== empleado(a.to).dept
    if (critica && a.pasadaEl === hoy) return reply.code(409).send({ error: 'Una actividad crítica pasa de turno una sola vez al día.' })
    if (!critica) {
      if (cuenta((h) => h.por === por && h.hoy === hoy && h.turno === a.shift && !h.critica) >= LIMITE) {
        return reply.code(409).send({ error: 'Ya heredaste 2 actividades de ese turno hoy.' })
      }
      if (cruzada && cuenta((h) => h.por === por && h.hoy === hoy && h.cruzada && !h.critica) >= LIMITE) {
        return reply.code(409).send({ error: 'Ya heredaste 2 actividades a otro departamento hoy.' })
      }
    }
    const valida = validadorDe(r)
    const directa = critica || valida === por
    const h = {
      id: siguienteId(herencias), act: a.id, por, para, motivo: motivo.trim(), hoy, turno: a.shift, cruzada, critica, valida,
      estado: directa ? 'aceptada' : 'pendiente', at: ahora(),
    }
    herencias.push(h)
    let creada
    if (directa) h.nueva = (creada = traspasar(a, para, por, hoy)).id
    else {
      a.herencia = h.id
      notificar({ for: valida, kind: 'herencia-pendiente', who: por, ref: a.id })
    }
    // creada: la actividad que ya recibió (fecha y turno), si entró directo
    return reply.code(201).send({ ...vistaHerencia(h), creada })
  })

  // Lo que el encargado tiene por validar, lo que propuso y cuánto le queda hoy de cada límite
  app.get('/api/herencias/:no', { schema: { ...porEmpleado, querystring: objeto(['hoy'], { hoy: { type: 'string', format: 'date' } }) } },
    conEmpleado((u, req, reply) => {
      if (!esEncargado(u)) return reply.code(403).send({ error: 'Solo los encargados heredan actividades.' })
      const { hoy } = req.query
      const equipoDe = [u, ...equipo(u.no)]
      return {
        limite: LIMITE,
        usadas: {
          turnos: Object.fromEntries(['A', 'B', 'C'].map((t) => [t, cuenta((h) => h.por === u.no && h.hoy === hoy && h.turno === t && !h.critica)])),
          cruzadas: cuenta((h) => h.por === u.no && h.hoy === hoy && h.cruzada && !h.critica),
          redirecciones: herencias.filter((h) => h.resueltaPor === u.no && h.resueltaHoy === hoy && h.estado === 'redirigida').length,
        },
        porValidar: herencias.filter((h) => h.valida === u.no && h.estado === 'pendiente').map((h) => {
          const a = actividades.find((x) => x.id === h.act)
          // A quién más de su equipo se puede redirigir
          const opciones = equipoDe.filter((e) => e.no !== h.para && puedeRecibir(a, e))
            .map(({ no, name, role, shift }) => ({ no, name, role, shift }))
          return { ...vistaHerencia(h), opciones }
        }),
        enviadas: herencias.filter((h) => h.por === u.no).slice(-20).reverse().map(vistaHerencia),
      }
    }))

  app.post('/api/herencias/:id/responder', { schema: responderSchema }, async (req, reply) => {
    const h = herencias.find((x) => x.id === req.params.id)
    if (!h) return reply.code(404).send({ error: 'Herencia no encontrada.' })
    const { por, accion, comentario: nota = '', para, hoy } = req.body
    if (h.valida !== por) return reply.code(403).send({ error: 'Solo valida el encargado de quien la recibe.' })
    if (h.estado !== 'pendiente') return reply.code(409).send({ error: 'Esa herencia ya se resolvió.' })
    if (!hoyValido(hoy)) return reply.code(400).send({ error: 'Revisa la fecha de tu equipo.' })
    if (accion !== 'aceptar' && !nota.trim()) return reply.code(400).send({ error: 'Escribe el motivo.' })
    const a = actividades.find((x) => x.id === h.act)
    const resolver = (estado) => {
      Object.assign(h, { estado, respuesta: nota.trim(), resueltaPor: por, resueltaHoy: hoy, resueltaAt: ahora() })
      delete a.herencia
      notificar({ for: h.por, kind: `herencia-${estado}`, who: por, ref: a.id })
    }
    if (accion === 'rechazar') {
      resolver('rechazada')
      return vistaHerencia(h)
    }
    // Mientras esperaba, el ejecutor pudo terminarla
    if (!heredable(a)) {
      resolver('anulada')
      return reply.code(409).send({ error: 'La actividad ya no está pendiente: se anuló la herencia.' })
    }
    let destino = h.para
    if (accion === 'redirigir') {
      const r = empleado(para)
      if (!r || r.no === h.para || (r.no !== por && !equipo(por).some((e) => e.no === r.no)) || !puedeRecibir(a, r)) {
        return reply.code(400).send({ error: 'Redirige a alguien de tu equipo, del mismo nivel de puesto y del turno siguiente.' })
      }
      const usadas = herencias.filter((x) => x.resueltaPor === por && x.resueltaHoy === hoy && x.estado === 'redirigida').length
      if (usadas >= LIMITE) return reply.code(409).send({ error: 'Ya redirigiste 2 actividades hoy.' })
      destino = r.no
      h.redirigidaA = r.no
    }
    const creada = traspasar(a, destino, h.por, hoy)
    h.nueva = creada.id
    resolver(accion === 'redirigir' ? 'redirigida' : 'aceptada')
    return { ...vistaHerencia(h), creada }
  })


  app.post('/api/reportes', { schema: reporteSchema }, async (req, reply) => {
    const { por, empleados, desde, hasta, turno } = req.body
    const encargado = empleado(por)
    if (!encargado || !esEncargado(encargado)) return reply.code(403).send({ error: 'Solo los encargados generan reportes.' })
    const permitidos = [por, ...equipo(por).map((e) => e.no)]
    if (!empleados.every((no) => permitidos.includes(no))) {
      return reply.code(403).send({ error: 'Solo puedes consultar a tu equipo.' })
    }
    // Incluye las heredadas: el reporte es el historial completo
    return actividades
      .filter((a) => empleados.includes(a.to) && a.date >= desde && a.date <= hasta && (!turno || a.shift === turno))
      .sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at))
      .map((a) => {
        const e = empleado(a.to)
        return {
          id: a.id, date: a.date, shift: a.shift, at: a.at, text: a.text, pct: a.pct, status: a.status, note: a.note,
          mgr: a.mgr, inh: !!a.inh, heredadaA: a.handedTo && empleado(a.handedTo).name, prioridad: a.prioridad, criticidad: a.criticidad, cerrada: !!a.cerrada,
          no: a.to, doneAt: a.doneAt ?? (a.status === 'done' ? a.at : undefined), // para el comparativo
          name: e.name, role: e.role, dept: e.dept,
        }
      })
  })

  // Matriz de seguimiento del equipo entre dos fechas (hasta hoy):
  // - yield de diarias y de urgentes: realizadas ÷ las que cuentan. Las de hoy abiertas y las urgentes aún sin
  //   cerrar no cuentan todavía; una heredada cuenta una vez, en quien la recibió
  // - tiempo extra (minutos) y asistencia según el checador, hasta ayer (la salida de hoy aún no ocurre)
  app.get('/api/matriz/:no', { schema: matrizSchema }, conEmpleado((u, req, reply) => {
    if (!esEncargado(u)) return reply.code(403).send({ error: 'Solo los encargados ven a su equipo.' })
    const { desde, hoy } = req.query
    if (!hoyValido(hoy)) return reply.code(400).send({ error: 'Revisa la fecha de tu equipo.' })
    const hasta = req.query.hasta < hoy ? req.query.hasta : hoy
    if (desde > hasta || sumarDias(desde, 366) < hasta) return reply.code(400).send({ error: 'Elige un periodo de hasta un año, sin fechas futuras.' })
    const hastaAyer = hasta < hoy ? hasta : sumarDias(hoy, -1)
    let habiles = 0
    for (let d = desde; d <= hastaAyer; d = diaSiguiente(d)) habiles += diaHabil(d)
    const periodo = vigentes().filter((a) => a.date >= desde && a.date <= hasta)
    const yieldDe = (acts) => [acts.filter((a) => a.status === 'done').length, acts.length]
    return equipo(u.no)
      .sort((a, b) => RANGO[a.role] - RANGO[b.role] || a.name.localeCompare(b.name))
      .map(({ no, name, role, shift, boss }) => {
        const suyas = periodo.filter((a) => a.to === no)
        const marcas = checador.filter((r) => r.no === no && r.date >= desde && r.date <= hastaAyer)
        return {
          no, name, role, shift, boss,
          diarias: yieldDe(suyas.filter((a) => a.prioridad !== 'urgente' && (a.status === 'done' || a.date < hoy))),
          urgentes: yieldDe(suyas.filter((a) => a.prioridad === 'urgente' && (a.status === 'done' || a.cerrada))),
          extra: marcas.reduce((s, r) => s + tiempoExtra(r, shift), 0),
          asistencia: [marcas.filter((r) => diaHabil(r.date)).length, habiles],
        }
      })
  }))

  if (existsSync(dist)) {
    app.register(fastifyStatic, {
      root: dist,
      // Los archivos de /assets llevan un hash en el nombre: nunca cambian, el navegador puede guardarlos para siempre
      setHeaders: (reply, ruta) => {
        if (ruta.includes('/assets/')) reply.header('cache-control', 'public, max-age=31536000, immutable')
      },
    })
  }

  return app
}
