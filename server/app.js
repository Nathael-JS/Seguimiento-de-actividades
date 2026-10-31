import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { existsSync, readFileSync } from 'node:fs'

// shortcut: datos de prueba en JSON y contraseñas en texto plano, cambiar a PostgreSQL + hash al agregar seguridad
const leer = (archivo) => JSON.parse(readFileSync(new URL(archivo, import.meta.url)))
const usuarios = leer('./usuarios.json')
const actividades = leer('./actividades.json')
const notificaciones = leer('./notificaciones.json')
const dist = new URL('../dist/', import.meta.url)

const ENCARGADOS = ['gte', 'sr', 'full']

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

const inicioSchema = {
  params: { type: 'object', properties: { no: { type: 'string', pattern: '^\\d{1,10}$' } } },
}

// Acepta correo completo, la parte antes de la @ o el número de empleado
const buscar = (id) =>
  usuarios.find((u) => u.email === id || u.email.split('@')[0] === id || u.no === id)

const nombre = (no) => usuarios.find((u) => u.no === no)?.name

// Todos los empleados debajo de `no` en la jerarquía, directos e indirectos
const equipo = (no) => usuarios.filter((u) => u.boss === no).flatMap((u) => [u.no, ...equipo(u.no)])

export function build(opts = {}) {
  const app = Fastify(opts)

  app.post('/api/login', { schema: loginSchema }, async (req, reply) => {
    const u = buscar(req.body.usuario.trim().toLowerCase())
    if (!u || u.password !== req.body.password) {
      return reply.code(401).send({ error: 'Usuario o contraseña incorrectos.' })
    }
    const { no, name, role, dept, shift, area } = u
    return { no, name, role, dept, shift, area, encargado: ENCARGADOS.includes(role) }
  })

  // shortcut: cualquiera puede consultar a cualquier empleado, validar sesión al agregar seguridad
  app.get('/api/inicio/:no', { schema: inicioSchema }, async (req, reply) => {
    const u = usuarios.find((x) => x.no === req.params.no)
    if (!u) return reply.code(404).send({ error: 'Empleado no encontrado.' })

    // El encargado ve las actividades de su equipo; el ejecutor, solo las suyas
    const alcance = ENCARGADOS.includes(u.role) ? equipo(u.no) : [u.no]
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
          who: nombre(n.who),
          actividad: actividades.find((a) => a.id === n.ref)?.text,
          count: n.count,
          time: n.time,
          read: n.read,
        })),
    }
  })

  if (existsSync(dist)) app.register(fastifyStatic, { root: dist })

  return app
}
