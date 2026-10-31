import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { build } from './app.js'
import { prepararDb } from './db.js'

// PostgreSQL real en memoria; query sin parámetros va por exec porque PGlite no acepta varias sentencias en query
const pglite = new PGlite()
const db = { query: (sql, params) => (params ? pglite.query(sql, params) : pglite.exec(sql).then((r) => r.at(-1))) }
await prepararDb(db)
const app = build(db)

const login = (payload) => app.inject({ method: 'POST', url: '/api/login', payload })

test('login correcto por correo, alias o número de empleado', async () => {
  for (const usuario of ['jorge.salinas@empresa.com', ' Jorge.Salinas ', '10482']) {
    const res = await login({ usuario, password: 'demo1234' })
    assert.equal(res.statusCode, 200, usuario)
    assert.equal(res.json().name, 'Jorge Salinas')
    assert.equal(res.json().password, undefined)
  }
})

test('contraseña o usuario incorrecto da 401', async () => {
  assert.equal((await login({ usuario: '10482', password: 'mala' })).statusCode, 401)
  assert.equal((await login({ usuario: 'nadie', password: 'demo1234' })).statusCode, 401)
})

test('entrada inválida da 400', async () => {
  for (const payload of [{}, { usuario: '', password: 'x' }, { usuario: '   ', password: 'x' }, { usuario: 'a'.repeat(101), password: 'x' }]) {
    assert.equal((await login(payload)).statusCode, 400, JSON.stringify(payload))
  }
})

const inicio = (no) => app.inject({ method: 'GET', url: `/api/inicio/${no}` })

test('login indica si es encargado', async () => {
  assert.equal((await login({ usuario: '10482', password: 'demo1234' })).json().encargado, false)
  assert.equal((await login({ usuario: '10230', password: 'demo1234' })).json().encargado, true)
})

test('inicio del ejecutor cuenta solo sus actividades', async () => {
  const d = (await inicio('10482')).json()
  assert.deepEqual([d.asignadas, d.realizadas, d.abiertas, d.avance], [4, 1, 1, 50])
  assert.equal(d.notificaciones.length, 2)
  assert.equal(d.notificaciones[0].who, 'Diego Herrera')
})

test('inicio del encargado cuenta todo su equipo, directos e indirectos', async () => {
  // Diego (Ing. Full) tiene a Jorge y María: actividades 1-6
  assert.equal((await inicio('10230')).json().asignadas, 6)
  // Laura (Gerente) tiene a todo Liquid Cooling: actividades 1-14
  assert.equal((await inicio('10001')).json().asignadas, 14)
})

test('inicio con número inválido o inexistente', async () => {
  assert.equal((await inicio('abc')).statusCode, 400)
  assert.equal((await inicio('99999')).statusCode, 404)
})

test('prepararDb es idempotente: no duplica los datos de prueba', async () => {
  await prepararDb(db)
  assert.equal((await db.query('SELECT count(*)::int AS n FROM empleados', [])).rows[0].n, 15)
  const { rows } = await db.query("INSERT INTO actividades (assignee, assigner, date, shift, time, text, status, pct) VALUES ('10482', '10230', '2026-10-30', 'A', '07:00', 'x', 'pending', 0) RETURNING id", [])
  assert.equal(rows[0].id, 15)
})
