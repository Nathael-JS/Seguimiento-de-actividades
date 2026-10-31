import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
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

test('sirve el frontend compilado; /assets con caché larga e index.html sin caché', { skip: !existsSync(new URL('../dist/index.html', import.meta.url)) && 'falta npm run build' }, async () => {
  const app = build()
  const index = await app.inject('/')
  assert.equal(index.statusCode, 200)
  assert.match(index.headers['cache-control'], /max-age=0/)
  const asset = index.body.match(/\/assets\/[^"]+\.js/)[0]
  const res = await app.inject(asset)
  assert.equal(res.statusCode, 200)
  assert.match(res.headers['cache-control'], /immutable/)
})

const heredar = (app, id, por, para) => pedir(app, 'POST', `/api/actividades/${id}/heredar`, { por, para })

test('equipo trae jefe y actividades vigentes de cada miembro', async () => {
  const jorge = (await pedir(build(), 'GET', '/api/equipo/10230')).body.find((e) => e.no === '10482')
  assert.equal(jorge.boss, '10230')
  assert.deepEqual(jorge.actividades.map((a) => a.id), [4, 3, 2, 1])
})

test('heredar al mismo empleado: día siguiente, mismo turno; la original sale de listas e indicadores', async () => {
  const app = build()
  const { code, body } = await heredar(app, 3, '10230', '10482')
  assert.equal(code, 201)
  assert.deepEqual([body.to, body.by, body.date, body.shift, body.status, body.inh], ['10482', '10230', '2026-10-30', 'A', 'pending', true])
  const ids = (await pedir(app, 'GET', '/api/actividades/10482')).body.map((a) => a.id)
  assert.ok(ids.includes(body.id) && !ids.includes(3))
  const inicio = (await pedir(app, 'GET', '/api/inicio/10482')).body
  assert.deepEqual([inicio.asignadas, inicio.abiertas], [4, 1]) // no se cuenta dos veces
  assert.deepEqual([inicio.notificaciones[0].kind, inicio.notificaciones[0].actividad], ['inherited', 'Actualizar hoja de WIP de la estación'])
  assert.equal((await pedir(app, 'PATCH', '/api/actividades/3', { por: '10482', estado: 'done', avance: 100 })).code, 409)
  assert.equal((await heredar(app, 3, '10230', '10482')).code, 409) // una sola vez
})

test('heredar a otro empleado: siguiente turno; del C pasa al A del día siguiente', async () => {
  const app = build()
  // Luis (turno B, incompleta) → Héctor: mismo día, turno C
  const b = (await heredar(app, 9, '10251', '10547')).body
  assert.deepEqual([b.to, b.date, b.shift, b.pct], ['10547', '2026-10-28', 'C', 65])
  // Una actividad del turno C heredada a otro pasa al turno A del día siguiente
  const [c] = (await pedir(app, 'POST', '/api/actividades', asignar({ turno: 'C', fecha: '2026-10-31', puntos: [{ texto: 'Ronda nocturna', avance: 0 }] }))).body
  const a = (await heredar(app, c.id, '10230', '10490')).body
  assert.deepEqual([a.to, a.date, a.shift], ['10490', '2026-11-01', 'A'])
})

test('heredar valida permisos y estado', async () => {
  const app = build()
  assert.equal((await heredar(app, 9, '10230', '10482')).code, 403) // Luis no es del equipo de Diego
  assert.equal((await heredar(app, 3, '10482', '10482')).code, 403) // un técnico no hereda
  assert.equal((await heredar(app, 3, '10230', '10112')).code, 403) // no a un Senior
  assert.equal((await heredar(app, 1, '10230', '10482')).code, 409) // ya realizada
  assert.equal((await heredar(app, 999, '10230', '10482')).code, 404)
})

test('reportes: filtra por empleados, fechas y turno, y muestra la acción tomada', async () => {
  const app = build()
  const reporte = (cambios) => pedir(app, 'POST', '/api/reportes', { por: '10230', empleados: ['10482', '10490'], desde: '2026-10-28', hasta: '2026-10-29', ...cambios })
  const filas = (await reporte()).body
  assert.equal(filas.length, 6)
  assert.equal(filas[0].text, 'Pareto de fallas de la semana') // más reciente primero: 29/10 06:31
  assert.equal(filas.find((f) => f.id === 4).accion, 'Recibida por herencia')
  assert.equal((await reporte({ turno: 'B' })).body.length, 0)
  assert.equal((await reporte({ desde: '2026-10-30', hasta: '2026-10-31' })).body.length, 0)
  await heredar(app, 3, '10230', '10490')
  assert.equal((await reporte()).body.find((f) => f.id === 3).accion, 'Heredada a María López')
  assert.equal((await reporte({ empleados: ['10511'] })).code, 403) // no es de su equipo
  assert.equal((await reporte({ por: '10482' })).code, 403)
  assert.equal((await reporte({ empleados: [] })).code, 400)
})
