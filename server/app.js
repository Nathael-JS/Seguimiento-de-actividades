import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { existsSync, readFileSync } from 'node:fs'

const leer = (archivo) => JSON.parse(readFileSync(new URL(archivo, import.meta.url)))
const dist = new URL('../dist/', import.meta.url)

// Menor número = más rango. Encargados: Gerente, Senior, Ing. Full
const RANGO = { gte: 0, sr: 1, full: 2, jr: 3, tec: 4 }
const esEncargado = (u) => RANGO[u.role] <= 2
const ESTADOS = ['done', 'progress', 'pending', 'incomplete']

const noEmpleado = { type: 'string', pattern: '^\\d{1,10}$' }
const texto = (max) => ({ type: 'string', maxLength: max })
const porEmpleado = { params: { type: 'object', properties: { no: noEmpleado } } }

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

const ahora = () => new Date().toTimeString().slice(0, 5)

export function build(opts = {}) {
  const app = Fastify(opts)

  // shortcut: datos de prueba en memoria (cada arranque vuelve a los JSON) y contraseñas en texto plano;
  // cambiar a PostgreSQL + hash cuando se retome la base de datos
  const usuarios = leer('./usuarios.json')
  const actividades = leer('./actividades.json')
  const notificaciones = leer('./notificaciones.json')
  const siguienteId = (lista) => Math.max(0, ...lista.map((x) => x.id)) + 1

  const empleado = (no) => usuarios.find((u) => u.no === no)
  // Acepta correo completo, la parte antes de la @ o el número de empleado
  const buscar = (id) =>
    usuarios.find((u) => u.email === id || u.email.split('@')[0] === id || u.no === id)
  // Todos los empleados debajo de `no` en la jerarquía, directos e indirectos
  const equipo = (no) => usuarios.filter((u) => u.boss === no).flatMap((u) => [u, ...equipo(u.no)])
  // A quién puede asignar un encargado: su equipo, solo con menor rango que él
  const asignables = (u) => equipo(u.no).filter((e) => RANGO[e.role] > RANGO[u.role])
  const notificar = (n) => notificaciones.push({ id: siguienteId(notificaciones), time: ahora(), read: false, ...n })

  const conEmpleado = (handler) => async (req, reply) => {
    const u = empleado(req.params.no)
    if (!u) return reply.code(404).send({ error: 'Empleado no encontrado.' })
    return handler(u, req, reply)
  }

  app.post('/api/login', { schema: loginSchema }, async (req, reply) => {
    const u = buscar(req.body.usuario.trim().toLowerCase())
    if (!u || u.password !== req.body.password) {
      return reply.code(401).send({ error: 'Usuario o contraseña incorrectos.' })
    }
    const { no, name, role, dept, shift, area } = u
    return { no, name, role, dept, shift, area, encargado: esEncargado(u) }
  })

  // shortcut: el cliente dice quién es (no, por) sin sesión; validar sesión al agregar seguridad
  app.get('/api/inicio/:no', { schema: porEmpleado }, conEmpleado((u) => {
    // El encargado ve las actividades de su equipo; el ejecutor, solo las suyas
    const alcance = esEncargado(u) ? equipo(u.no).map((e) => e.no) : [u.no]
    const acts = actividades.filter((a) => alcance.includes(a.to))
    return {
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

  app.get('/api/equipo/:no', { schema: porEmpleado }, conEmpleado((u, req, reply) => {
    if (!esEncargado(u)) return reply.code(403).send({ error: 'Solo los encargados asignan actividades.' })
    return asignables(u)
      .sort((a, b) => RANGO[a.role] - RANGO[b.role] || a.name.localeCompare(b.name))
      .map(({ no, name, role, dept, shift }) => ({ no, name, role, dept, shift }))
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
    actividades
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

    const cambioEstado = estado !== a.status
    const cambioNota = nota.trim() !== a.note
    Object.assign(a, { status: estado, pct: estado === 'done' ? 100 : req.body.avance, note: nota.trim() })
    // El encargado se entera del cambio de estado y del comentario por separado, como en el mockup
    if (cambioEstado) notificar({ for: a.by, kind: estado, who: por, ref: a.id })
    if (cambioNota) notificar({ for: a.by, kind: 'comment', who: por, ref: a.id })
    return { ...a, byName: empleado(a.by)?.name }
  })

  if (existsSync(dist)) app.register(fastifyStatic, { root: dist })

  return app
}
