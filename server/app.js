import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { existsSync, readFileSync } from 'node:fs'
import { randomInt, randomUUID } from 'node:crypto'

const leer = (archivo) => JSON.parse(readFileSync(new URL(archivo, import.meta.url)))
const dist = new URL('../dist/', import.meta.url)

// Menor número = más rango. Encargados: Gerente, Senior, Ing. Full
const RANGO = { gte: 0, sr: 1, full: 2, jr: 3, tec: 4 }
const esEncargado = (u) => RANGO[u.role] <= 2
const ESTADOS = ['done', 'progress', 'pending', 'incomplete']

const noEmpleado = { type: 'string', pattern: '^\\d{1,10}$' }
const texto = (max) => ({ type: 'string', maxLength: max })
const porEmpleado = { params: { type: 'object', properties: { no: noEmpleado } } }
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
const objeto = (requeridos, properties) => ({ type: 'object', required: requeridos, additionalProperties: false, properties })

const verificarSchema = { body: objeto(['token', 'codigo'], { token, codigo: { type: 'string', pattern: '^\\d{6}$' } }) }
const reenviarSchema = { body: objeto(['token'], { token }) }
const registroSchema = {
  body: objeto(['name', 'no', 'email', 'role', 'dept', 'shift', 'password'], {
    name: { type: 'string', minLength: 3, maxLength: 100, pattern: '\\S' },
    no: { type: 'string', pattern: '^\\d{4,10}$' },
    email: { type: 'string', format: 'email', maxLength: 100 },
    role: { enum: ['tec', 'jr', 'full', 'sr', 'gte'] },
    dept: { enum: ['lc', 'pf', 'smt'] },
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

const heredarSchema = {
  params: { type: 'object', properties: { id: { type: 'integer', minimum: 1 } } },
  body: {
    type: 'object',
    required: ['por', 'para', 'hoy'],
    additionalProperties: false,
    // hoy: la fecha local de quien hereda; la del servidor es UTC y de noche ya es mañana en México
    properties: { por: noEmpleado, para: noEmpleado, hoy: { type: 'string', format: 'date' } },
  },
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
const diasPassword = (u) => VIGENCIA_PASSWORD - Math.floor((Date.now() - Date.parse(u.pwdChanged)) / DIA)
// j•••••@empresa.com
const ocultarCorreo = (email) => email.replace(/^(.).*(@.*)$/, '$1•••••$2')
const SIGUIENTE_TURNO = { A: 'B', B: 'C', C: 'A' }
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
  // Códigos de verificación y permisos de recuperación pendientes, por token
  const verificaciones = new Map()
  const recuperaciones = new Map()
  const limpiarVencidos = (mapa) => mapa.forEach((v, k) => v.vence < Date.now() && mapa.delete(k))
  const nuevoCodigo = () => String(randomInt(0, 1_000_000)).padStart(6, '0')
  const siguienteId = (lista) => Math.max(0, ...lista.map((x) => x.id)) + 1

  const empleado = (no) => usuarios.find((u) => u.no === no)
  // Acepta correo completo, la parte antes de la @ o el número de empleado
  const buscar = (id) =>
    usuarios.find((u) => u.email === id || u.email.split('@')[0] === id || u.no === id)
  // Todos los empleados debajo de `no` en la jerarquía, directos e indirectos
  const equipo = (no) => usuarios.filter((u) => u.boss === no).flatMap((u) => [u, ...equipo(u.no)])
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
      notificar({ for: a.by, kind: 'overdue', who: a.to, ref: a.id })
    }
    for (const u of usuarios) {
      const dias = diasPassword(u)
      if (dias > 15 || u.avisoPassword === u.pwdChanged) continue
      u.avisoPassword = u.pwdChanged
      notificar({ for: u.no, kind: 'password', count: Math.max(dias, 0) })
    }
  }
  // Al cambiar la contraseña el aviso de "vence en N días" ya no aplica: se marca como leído
  const cambiarPassword = (u, password) => {
    Object.assign(u, { password, pwdChanged: ahora() })
    notificaciones.filter((n) => n.for === u.no && n.kind === 'password').forEach((n) => (n.read = true))
  }
  const delTurno = (acts, desde) =>
    desde ? acts.filter((a) => a.status !== 'done' || Date.parse(a.doneAt ?? a.at) >= Date.parse(desde)) : acts
  const notificar = (n) => notificaciones.push({ id: siguienteId(notificaciones), at: ahora(), read: false, ...n })

  const conEmpleado = (handler) => async (req, reply) => {
    const u = empleado(req.params.no)
    if (!u) return reply.code(404).send({ error: 'Empleado no encontrado.' })
    return handler(u, req, reply)
  }

  const sesion = (u) => ({ no: u.no, name: u.name, role: u.role, dept: u.dept, shift: u.shift, area: u.area, encargado: esEncargado(u) })

  // Paso 1: usuario y contraseña. Si son correctos se genera el código del paso 2
  app.post('/api/login', { schema: loginSchema }, async (req, reply) => {
    const u = buscar(req.body.usuario.trim().toLowerCase())
    if (!u || u.password !== req.body.password) {
      return reply.code(401).send({ error: 'Usuario o contraseña incorrectos.' })
    }
    limpiarVencidos(verificaciones)
    const id = randomUUID()
    const codigo = nuevoCodigo()
    verificaciones.set(id, { no: u.no, codigo, intentos: 0, vence: Date.now() + 5 * 60_000 })
    // shortcut: el código se devuelve en la respuesta (simulado); enviarlo por correo cuando haya servicio de email
    return { token: id, destino: ocultarCorreo(u.email), codigo }
  })

  // Paso 2: el código de 6 dígitos. Expira a los 5 minutos y admite 5 intentos
  app.post('/api/login/verificar', { schema: verificarSchema }, async (req, reply) => {
    const v = verificaciones.get(req.body.token)
    if (!v || v.vence < Date.now()) {
      verificaciones.delete(req.body.token)
      return reply.code(401).send({ error: 'El código expiró. Vuelve a iniciar sesión.' })
    }
    if (v.codigo !== req.body.codigo) {
      if (++v.intentos >= 5) {
        verificaciones.delete(req.body.token)
        return reply.code(401).send({ error: 'Demasiados intentos. Vuelve a iniciar sesión.' })
      }
      return reply.code(401).send({ error: 'Código incorrecto.' })
    }
    verificaciones.delete(req.body.token)
    return sesion(empleado(v.no))
  })

  app.post('/api/login/reenviar', { schema: reenviarSchema }, async (req, reply) => {
    const v = verificaciones.get(req.body.token)
    if (!v || v.vence < Date.now()) return reply.code(401).send({ error: 'El código expiró. Vuelve a iniciar sesión.' })
    Object.assign(v, { codigo: nuevoCodigo(), intentos: 0, vence: Date.now() + 5 * 60_000 })
    return { codigo: v.codigo }
  })

  app.post('/api/registro', { schema: registroSchema }, async (req, reply) => {
    const { name, no, role, dept, shift, boss, area = '', password } = req.body
    const email = req.body.email.trim().toLowerCase()
    if (empleado(no)) return reply.code(409).send({ error: 'Ese número de empleado ya está registrado.' })
    if (usuarios.some((u) => u.email === email)) return reply.code(409).send({ error: 'Ese correo ya está registrado.' })

    const nuevo = { no, name: name.trim(), role, dept, shift, email, pwdChanged: ahora(), password }
    if (RANGO[role] <= 2) {
      // Encargado: indica su área; no elige jefe (como en el mockup)
      if (!area.trim()) return reply.code(400).send({ error: 'Escribe tu área dentro del departamento.' })
      Object.assign(nuevo, { boss: null, area: area.trim() })
    } else {
      // Técnico / Ing. Jr: elige a su encargado del mismo departamento y hereda su área
      const jefe = boss && empleado(boss)
      if (!jefe || !esEncargado(jefe) || jefe.dept !== dept) {
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

  app.get('/api/departamentos', { schema: conRate }, async (req) => {
    const rate = conRateDe(req.query)
    return usuarios
      .map(({ no, name, role, dept, shift, area }) => ({ no, name, role, dept, shift, area, ...rate(no) }))
      .sort((a, b) => RANGO[a.role] - RANGO[b.role] || a.name.localeCompare(b.name))
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
    cambiarPassword(u, req.body.nueva)
    return { ok: true }
  }))

  // shortcut: el cliente dice quién es (no, por) sin sesión; validar sesión al agregar seguridad
  app.get('/api/inicio/:no', { schema: conDesde }, conEmpleado((u, req) => {
    // Un reloj mal puesto en el navegador marcaría como atrasado todo y avisaría a todos, sin vuelta atrás:
    // solo se aceptan fechas a un día o menos de la del servidor (cubre cualquier zona horaria)
    const { hoy } = req.query
    if (hoy && Math.abs(Date.parse(hoy) - Date.parse(ahora().slice(0, 10))) <= 86_400_000) generarAvisos(hoy)
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
    const { por, para, fecha, turno, puntos, comentario = '' } = req.body
    const encargado = empleado(por)
    if (!encargado || !esEncargado(encargado)) {
      return reply.code(403).send({ error: 'Solo los encargados registran actividades.' })
    }
    if (!asignables(encargado).some((e) => e.no === para)) {
      return reply.code(403).send({ error: 'Ese empleado no está a tu cargo.' })
    }
    const at = ahora()
    const nuevas = puntos.map((p) => {
      const a = {
        id: siguienteId(actividades), to: para, by: por, date: fecha, shift: turno, at,
        text: p.texto.trim(), pct: p.avance, status: p.avance === 100 ? 'done' : p.avance > 0 ? 'progress' : 'pending',
        mgr: comentario.trim(), note: '', ...(p.avance === 100 && { doneAt: at }),
      }
      actividades.push(a)
      return a
    })
    notificar({ for: para, kind: 'assigned', who: por, count: nuevas.length })
    return reply.code(201).send(nuevas)
  })

  app.get('/api/actividades/:no', { schema: porEmpleado }, conEmpleado((u) =>
    vigentes()
      .filter((a) => a.to === u.no)
      // Las realizadas al final, el resto de la más nueva a la más vieja
      .sort((a, b) => (a.status === 'done') - (b.status === 'done') || b.id - a.id)
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

    const cambioEstado = estado !== a.status
    const cambioNota = nota.trim() !== a.note
    // doneAt: cuándo quedó realizada; se conserva si ya lo estaba y se borra si se reabre
    Object.assign(a, {
      status: estado, pct: estado === 'done' ? 100 : avance, note: nota.trim(),
      doneAt: estado !== 'done' ? undefined : a.status === 'done' ? a.doneAt : ahora(),
    })
    // El encargado se entera del cambio de estado y del comentario por separado, como en el mockup
    if (cambioEstado) notificar({ for: a.by, kind: estado, who: por, ref: a.id })
    if (cambioNota) notificar({ for: a.by, kind: 'comment', who: por, ref: a.id })
    return { ...a, byName: empleado(a.by)?.name }
  })

  app.post('/api/actividades/:id/heredar', { schema: heredarSchema }, async (req, reply) => {
    const a = actividades.find((x) => x.id === req.params.id)
    if (!a) return reply.code(404).send({ error: 'Actividad no encontrada.' })
    const { por, para, hoy } = req.body
    const encargado = empleado(por)
    const suyos = encargado && esEncargado(encargado) ? asignables(encargado).map((e) => e.no) : []
    if (!suyos.includes(a.to)) return reply.code(403).send({ error: 'Esa actividad no es de tu equipo.' })
    if (a.handedTo || !['pending', 'incomplete'].includes(a.status)) {
      return reply.code(409).send({ error: 'Solo se heredan actividades pendientes o incompletas, una sola vez.' })
    }
    const mismo = para === a.to
    if (!mismo && !(suyos.includes(para) && RANGO[empleado(para).role] >= RANGO.jr)) {
      return reply.code(403).send({ error: 'Solo se hereda a un técnico o Ing. Jr de tu equipo.' })
    }

    // Mismo empleado: día siguiente, mismo turno. Otro: siguiente turno (tras el C viene el A del día siguiente).
    // Se cuenta desde hoy si la actividad es de días anteriores, para no crearla en el pasado
    const base = a.date > hoy ? a.date : hoy
    const nueva = {
      ...a, id: siguienteId(actividades), to: para, by: por, at: ahora(), status: 'pending', note: '', inh: true,
      date: mismo || a.shift === 'C' ? diaSiguiente(base) : base,
      shift: mismo ? a.shift : SIGUIENTE_TURNO[a.shift],
    }
    actividades.push(nueva)
    a.handedTo = para
    notificar({ for: para, kind: 'inherited', who: por, ref: nueva.id })
    return reply.code(201).send(nueva)
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
          mgr: a.mgr, inh: !!a.inh, heredadaA: a.handedTo && empleado(a.handedTo).name,
          name: e.name, role: e.role, dept: e.dept,
        }
      })
  })

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
