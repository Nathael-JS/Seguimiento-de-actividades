import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from './app.js'

const login = (payload) => build().inject({ method: 'POST', url: '/api/login', payload })

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

const inicio = (no) => build().inject({ method: 'GET', url: `/api/inicio/${no}` })

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

const pedir = (app, method, url, payload) => app.inject({ method, url, payload }).then((r) => ({ code: r.statusCode, body: r.json() }))
const asignar = (cambios = {}) => ({
  por: '10230', para: '10482', fecha: '2026-10-31', turno: 'A',
  puntos: [{ texto: 'Revisar bomba', avance: 0 }, { texto: 'Cambiar filtro', avance: 100 }], comentario: 'Urgente', ...cambios,
})

test('equipo asignable: solo encargados y solo empleados de menor rango', async () => {
  const app = build()
  assert.deepEqual((await pedir(app, 'GET', '/api/equipo/10230')).body.map((e) => e.no), ['10490', '10482'])
  // Laura (Gerente) puede asignar a Seniors, Fulls, Jrs y Técnicos de toda su rama
  assert.equal((await pedir(app, 'GET', '/api/equipo/10001')).body.length, 9)
  assert.equal((await pedir(app, 'GET', '/api/equipo/10482')).code, 403)
  assert.equal((await pedir(app, 'GET', '/api/equipo/99999')).code, 404)
})

test('registrar crea una actividad por punto, con estado según el avance, y notifica al ejecutor', async () => {
  const app = build()
  const { code, body } = await pedir(app, 'POST', '/api/actividades', asignar())
  assert.equal(code, 201)
  assert.deepEqual(body.map((a) => [a.id, a.status, a.pct, a.mgr]), [[15, 'pending', 0, 'Urgente'], [16, 'done', 100, 'Urgente']])
  const mias = (await pedir(app, 'GET', '/api/actividades/10482')).body
  assert.equal(mias.length, 6)
  assert.equal(mias[0].text, 'Revisar bomba')
  assert.equal(mias.at(-1).status, 'done')
  const inicio = (await pedir(app, 'GET', '/api/inicio/10482')).body
  assert.equal(inicio.notificaciones[0].kind, 'assigned')
  assert.equal(inicio.notificaciones[0].count, 2)
  assert.equal(inicio.asignadas, 6)
})

test('registrar valida permisos y entrada', async () => {
  const app = build()
  const codigo = async (cambios) => (await pedir(app, 'POST', '/api/actividades', asignar(cambios))).code
  assert.equal(await codigo({ por: '10482' }), 403) // un técnico no asigna
  assert.equal(await codigo({ para: '10511' }), 403) // Luis no está a cargo de Diego
  assert.equal(await codigo({ para: '10112' }), 403) // no puede asignar a alguien de mayor rango
  assert.equal(await codigo({ puntos: [] }), 400)
  assert.equal(await codigo({ puntos: [{ texto: '  ', avance: 0 }] }), 400)
  assert.equal(await codigo({ puntos: [{ texto: 'x', avance: 101 }] }), 400)
  assert.equal(await codigo({ fecha: '31/10/2026' }), 400)
  assert.equal(await codigo({ turno: 'D' }), 400)
})

test('actualizar: solo el asignado, realizada fuerza 100 % y notifica estado y comentario al encargado', async () => {
  const app = build()
  const actualizar = (id, body) => pedir(app, 'PATCH', `/api/actividades/${id}`, body)
  assert.equal((await actualizar(3, { por: '10490', estado: 'done', avance: 0 })).code, 403)
  assert.equal((await actualizar(999, { por: '10482', estado: 'done', avance: 0 })).code, 404)
  assert.equal((await actualizar(3, { por: '10482', estado: 'otro', avance: 0 })).code, 400)

  const { code, body } = await actualizar(3, { por: '10482', estado: 'done', avance: 30, nota: 'Listo' })
  assert.equal(code, 200)
  assert.deepEqual([body.status, body.pct, body.note], ['done', 100, 'Listo'])
  const avisos = (await pedir(app, 'GET', '/api/inicio/10230')).body.notificaciones.slice(0, 2)
  assert.deepEqual(avisos.map((n) => n.kind), ['comment', 'done'])

  // Sin cambios de estado ni de nota, no se notifica nada
  await actualizar(3, { por: '10482', estado: 'done', avance: 100, nota: 'Listo' })
  assert.equal((await pedir(app, 'GET', '/api/inicio/10230')).body.notificaciones.length, 2)
})

test('marcar notificaciones como leídas solo afecta al empleado', async () => {
  const app = build()
  assert.equal((await pedir(app, 'POST', '/api/notificaciones/10482/leidas')).code, 200)
  assert.ok((await pedir(app, 'GET', '/api/inicio/10482')).body.notificaciones.every((n) => n.read))
  assert.ok((await pedir(app, 'GET', '/api/inicio/10001')).body.notificaciones.some((n) => !n.read))
})
