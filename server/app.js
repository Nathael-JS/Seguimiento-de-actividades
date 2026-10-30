import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { existsSync, readFileSync } from 'node:fs'

// shortcut: usuarios y contraseñas en texto plano en un JSON, cambiar a PostgreSQL + hash al agregar seguridad
const usuarios = JSON.parse(readFileSync(new URL('./usuarios.json', import.meta.url)))
const dist = new URL('../dist/', import.meta.url)

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

// Acepta correo completo, la parte antes de la @ o el número de empleado
const buscar = (id) =>
  usuarios.find((u) => u.email === id || u.email.split('@')[0] === id || u.no === id)

export function build(opts = {}) {
  const app = Fastify(opts)

  app.post('/api/login', { schema: loginSchema }, async (req, reply) => {
    const u = buscar(req.body.usuario.trim().toLowerCase())
    if (!u || u.password !== req.body.password) {
      return reply.code(401).send({ error: 'Usuario o contraseña incorrectos.' })
    }
    return { no: u.no, name: u.name, role: u.role, dept: u.dept }
  })

  if (existsSync(dist)) app.register(fastifyStatic, { root: dist })

  return app
}
