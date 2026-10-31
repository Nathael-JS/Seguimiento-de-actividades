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
    required: ['por', 'para'],
    additionalProperties: false,
    properties: { por: noEmpleado, para: noEmpleado },
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

const ahora = () => new Date().toTimeString().slice(0, 5)
const DIA = 86_400_000
const VIGENCIA_PASSWORD = 90 // días
const hoyUtc = () => new Date().toISOString().slice(0, 10)
const diasPassword = (u) => VIGENCIA_PASSWORD - Math.floor((Date.parse(hoyUtc()) - Date.parse(u.pwdChanged)) / DIA)
// j•••••@empresa.com
const ocultarCorreo = (email) => email.replace(/^(.).*(@.*)$/, '$1•••••$2')
const SIGUIENTE_TURNO = { A: 'B', B: 'C', C: 'A' }
// Fechas AAAA-MM-DD se leen como medianoche UTC, así que sumar 24 h nunca salta ni repite un día
const diaSiguiente = (fecha) => new Date(Date.parse(fecha) + 86_400_000).toISOString().slice(0, 10)

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
  const notificar = (n) => notificaciones.push({ id: siguienteId(notificaciones), time: ahora(), read: false, ...n })

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

    const nuevo = { no, name: name.trim(), role, dept, shift, email, rate: null, pwdChanged: hoyUtc(), password }
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
    Object.assign(empleado(r.no), { password: req.body.password, pwdChanged: hoyUtc() })
    return { ok: true }
  })

  app.get('/api/departamentos', async () =>
    usuarios
      .map(({ no, name, role, dept, shift, area, rate }) => ({ no, name, role, dept, shift, area, rate }))
      .sort((a, b) => RANGO[a.role] - RANGO[b.role] || a.name.localeCompare(b.name)))

  app.get('/api/perfil/:no', { schema: porEmpleado }, conEmpleado((u) => {
    const { no, name, role, dept, shift, area, email, pwdChanged, boss } = u
    return { no, name, role, dept, shift, area, email, pwdChanged, bossName: empleado(boss)?.name, bossRole: empleado(boss)?.role, diasPassword: diasPassword(u) }
  }))

  app.post('/api/perfil/:no/password', { schema: cambiarPropiaSchema }, conEmpleado((u, req, reply) => {
    if (req.body.actual !== u.password) return reply.code(401).send({ error: 'La contraseña actual no es correcta.' })
    if (req.body.nueva === u.password) return reply.code(400).send({ error: 'La nueva contraseña debe ser distinta de la actual.' })
    Object.assign(u, { password: req.body.nueva, pwdChanged: hoyUtc() })
    return { ok: true }
  }))

  // shortcut: el cliente dice quién es (no, por) sin sesión; validar sesión al agregar seguridad
  app.get('/api/inicio/:no', { schema: porEmpleado }, conEmpleado((u) => {
    // El encargado ve las actividades de su equipo; el ejecutor, solo las suyas
    const alcance = esEncargado(u) ? equipo(u.no).map((e) => e.no) : [u.no]
    const acts = vigentes().filter((a) => alcance.includes(a.to))
    return {
      diasPassword: diasPassword(u),
      asignadas: acts.length,
      realizadas: acts.filter((a) => a.status === 'done').length,
      abiertas: acts.filter((a) => a.status === 'pending' || a.status === 'incomplete').length,
      avance: acts.length ? Math.round(acts.reduce((s, a) => s + a.pct, 0) / acts.length) : 0,
      notificaciones: notificaciones
        .filter((n) => n.for === u.no)
        .sort((a, b) => b.id - a.id)
        .map((n) => ({
          id: n.id,
          kind: n.kind,
          who: empleado(n.who)?.name,
          actividad: actividades.find((a) => a.id === n.ref)?.text,
          count: n.count,
          time: n.time,
          read: n.read,
        })),
    }
  }))

  app.post('/api/notificaciones/:no/leidas', { schema: porEmpleado }, conEmpleado((u) => {
    notificaciones.filter((n) => n.for === u.no).forEach((n) => (n.read = true))
    return { ok: true }
  }))

  // Equipo del encargado con sus actividades vigentes: alimenta Registrar, herencia, Monitoreo y Reportes
  app.get('/api/equipo/:no', { schema: porEmpleado }, conEmpleado((u, req, reply) => {
    if (!esEncargado(u)) return reply.code(403).send({ error: 'Solo los encargados ven a su equipo.' })
    const acts = vigentes()
    return asignables(u)
      .sort((a, b) => RANGO[a.role] - RANGO[b.role] || a.name.localeCompare(b.name))
      .map(({ no, name, role, dept, shift, boss }) => ({
        no, name, role, dept, shift, boss,
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
    const hora = ahora()
    const nuevas = puntos.map((p) => {
      const a = {
        id: siguienteId(actividades), to: para, by: por, date: fecha, shift: turno, time: hora,
        text: p.texto.trim(), pct: p.avance, status: p.avance === 100 ? 'done' : p.avance > 0 ? 'progress' : 'pending',
        mgr: comentario.trim(), note: '',
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
    const { por, estado, nota = a.note } = req.body
    if (a.to !== por) return reply.code(403).send({ error: 'Solo quien tiene asignada la actividad puede actualizarla.' })
    if (a.handedTo) return reply.code(409).send({ error: 'Esta actividad ya fue heredada a otro turno.' })

    const cambioEstado = estado !== a.status
    const cambioNota = nota.trim() !== a.note
    Object.assign(a, { status: estado, pct: estado === 'done' ? 100 : req.body.avance, note: nota.trim() })
    // El encargado se entera del cambio de estado y del comentario por separado, como en el mockup
    if (cambioEstado) notificar({ for: a.by, kind: estado, who: por, ref: a.id })
    if (cambioNota) notificar({ for: a.by, kind: 'comment', who: por, ref: a.id })
    return { ...a, byName: empleado(a.by)?.name }
  })

  app.post('/api/actividades/:id/heredar', { schema: heredarSchema }, async (req, reply) => {
    const a = actividades.find((x) => x.id === req.params.id)
    if (!a) return reply.code(404).send({ error: 'Actividad no encontrada.' })
    const { por, para } = req.body
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

    // Mismo empleado: día siguiente, mismo turno. Otro: siguiente turno (tras el C viene el A del día siguiente)
    const nueva = {
      ...a, id: siguienteId(actividades), to: para, by: por, time: ahora(), status: 'pending', note: '', inh: true,
      date: mismo || a.shift === 'C' ? diaSiguiente(a.date) : a.date,
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
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
      .map((a) => {
        const e = empleado(a.to)
        return {
          id: a.id, date: a.date, shift: a.shift, time: a.time, text: a.text, pct: a.pct, status: a.status, note: a.note,
          name: e.name, role: e.role, dept: e.dept,
          accion: a.handedTo ? `Heredada a ${empleado(a.handedTo).name}` : a.inh ? 'Recibida por herencia' : a.mgr,
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
