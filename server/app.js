import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { existsSync } from 'node:fs'

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

// Todos los empleados debajo de $1 en la jerarquía, directos e indirectos
const EQUIPO = `WITH RECURSIVE equipo AS (
    SELECT no FROM empleados WHERE boss = $1
    UNION ALL
    SELECT e.no FROM empleados e JOIN equipo q ON e.boss = q.no
  ) SELECT no FROM equipo`

// `db` es cualquier cliente con query(texto, parámetros): un Pool de pg o PGlite en las pruebas
export function build(db, opts = {}) {
  const app = Fastify(opts)

  app.post('/api/login', { schema: loginSchema }, async (req, reply) => {
    // Acepta correo completo, la parte antes de la @ o el número de empleado
    const { rows: [u] } = await db.query(
      `SELECT no, name, role, dept, shift, area, password FROM empleados
       WHERE email = $1 OR split_part(email, '@', 1) = $1 OR no = $1 LIMIT 1`,
      [req.body.usuario.trim().toLowerCase()],
    )
    if (!u || u.password !== req.body.password) {
      return reply.code(401).send({ error: 'Usuario o contraseña incorrectos.' })
    }
    const { password: _, ...perfil } = u
    return { ...perfil, encargado: ENCARGADOS.includes(u.role) }
  })

  // shortcut: cualquiera puede consultar a cualquier empleado, validar sesión al agregar seguridad
  app.get('/api/inicio/:no', { schema: inicioSchema }, async (req, reply) => {
    const { rows: [u] } = await db.query('SELECT no, role FROM empleados WHERE no = $1', [req.params.no])
    if (!u) return reply.code(404).send({ error: 'Empleado no encontrado.' })

    // El encargado ve las actividades de su equipo; el ejecutor, solo las suyas
    const alcance = ENCARGADOS.includes(u.role) ? EQUIPO : 'SELECT $1::text'
    const { rows: [indicadores] } = await db.query(
      `SELECT count(*)::int AS asignadas,
              count(*) FILTER (WHERE status = 'done')::int AS realizadas,
              count(*) FILTER (WHERE status IN ('pending', 'incomplete'))::int AS abiertas,
              coalesce(round(avg(pct)), 0)::int AS avance
       FROM actividades WHERE assignee IN (${alcance})`,
      [u.no],
    )
    const { rows: notificaciones } = await db.query(
      `SELECT n.id, n.kind, e.name AS who, a.text AS actividad, n.count,
              to_char(n.time, 'HH24:MI') AS time, n.read
       FROM notificaciones n
       JOIN empleados e ON e.no = n.actor
       LEFT JOIN actividades a ON a.id = n.activity_id
       WHERE n.recipient = $1 ORDER BY n.id DESC`,
      [u.no],
    )
    return { ...indicadores, notificaciones }
  })

  if (existsSync(dist)) app.register(fastifyStatic, { root: dist })

  return app
}
