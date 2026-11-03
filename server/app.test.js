import { mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { build } from './app.js'

const login = (payload, app = build()) => app.inject({ method: 'POST', url: '/api/login', payload })
// Login completo: usuario y contraseña, luego el código simulado
async function entrar(usuario, password = 'demo1234', app = build()) {
  const paso1 = (await login({ usuario, password }, app)).json()
  return app.inject({ method: 'POST', url: '/api/login/verificar', payload: { token: paso1.token, codigo: paso1.codigo } })
}

// Cookie de sesión de cada empleado, por instancia de la app (se inicia sesión la primera vez que se necesita)
const cookies = new WeakMap()
const cookieDe = (r) => r.headers['set-cookie']?.split(';')[0]
async function sesionDe(app, no) {
  if (!cookies.has(app)) cookies.set(app, new Map())
  const m = cookies.get(app)
  if (!m.has(no)) m.set(no, cookieDe(await entrar(no, 'demo1234', app)))
  return m.get(no)
}
// Pide a la API con la sesión de quien actúa: el "por" del cuerpo o el número en la dirección
async function pedir(app, method, url, payload) {
  const no = payload?.por ?? url.match(/^\/api\/(?:inicio|actividades|perfil|equipo|notificaciones|matriz)\/(\d{5})/)?.[1]
  const enviar = async () => {
    const cookie = no && await sesionDe(app, no)
    return app.inject({ method, url, payload, ...(cookie && { headers: { cookie } }) })
  }
  let r = await enviar()
  // Sesión vencida o cerrada (relojes simulados, cambio de contraseña): se vuelve a entrar una vez
  if (r.statusCode === 401 && r.json().sesion === false && no) {
    cookies.get(app).delete(no)
    r = await enviar()
  }
  return { code: r.statusCode, body: r.json() }
}
const inicio = (no) => pedir(build(), 'GET', `/api/inicio/${no}`).then((r) => ({ statusCode: r.code, json: () => r.body }))

test('login correcto por correo, alias o número de empleado, en dos pasos', async () => {
  for (const usuario of ['jorge.salinas@empresa.com', ' Jorge.Salinas ', '10482']) {
    const paso1 = await login({ usuario, password: 'demo1234' })
    assert.equal(paso1.statusCode, 200, usuario)
    assert.equal(paso1.json().destino, 'j•••••@empresa.com')
    assert.match(paso1.json().codigo, /^\d{6}$/)
    assert.equal(paso1.json().name, undefined) // sin código no hay sesión
    const res = await entrar(usuario)
    assert.equal(res.statusCode, 200, usuario)
    assert.equal(res.json().name, 'Jorge Salinas')
    assert.equal(res.json().password, undefined)
  }
})

test('verificación: código incorrecto, 5 intentos, reenviar y token desconocido', async () => {
  const app = build()
  const verificar = (token, codigo) => app.inject({ method: 'POST', url: '/api/login/verificar', payload: { token, codigo } })
  const { token, codigo } = (await login({ usuario: '10482', password: 'demo1234' }, app)).json()
  const malo = codigo === '000000' ? '111111' : '000000'
  assert.equal((await verificar(token, malo)).json().error, 'Código incorrecto.')
  const { codigo: nuevo } = (await app.inject({ method: 'POST', url: '/api/login/reenviar', payload: { token } })).json()
  assert.equal((await verificar(token, nuevo)).statusCode, 200)
  assert.equal((await verificar(token, nuevo)).statusCode, 401) // el código no se reutiliza

  const otro = (await login({ usuario: '10482', password: 'demo1234' }, app)).json()
  for (let i = 0; i < 4; i++) await verificar(otro.token, otro.codigo === '000000' ? '111111' : '000000')
  assert.match((await verificar(otro.token, otro.codigo === '000000' ? '111111' : '000000')).json().error, /Demasiados intentos/)
  assert.equal((await verificar(otro.token, otro.codigo)).statusCode, 401) // bloqueado aunque ahora acierte
  assert.equal((await verificar('no-existe', '123456')).statusCode, 401)
  assert.equal((await verificar(token, '12ab56')).statusCode, 400)
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


test('login indica si es encargado', async () => {
  assert.equal((await entrar('10482')).json().encargado, false)
  assert.equal((await entrar('10230')).json().encargado, true)
})

test('inicio del ejecutor cuenta solo sus actividades', async () => {
  const d = (await inicio('10482')).json()
  assert.deepEqual([d.asignadas, d.realizadas, d.abiertas, d.avance], [4, 1, 1, 50])
  assert.equal(d.notificaciones.length, 2)
  assert.equal(d.notificaciones[0].who, 'Diego Herrera')
})

test('inicio del encargado cuenta las suyas y las de todo su equipo, directos e indirectos', async () => {
  // Diego (Ing. Full): las de Jorge y María (1-6) y la suya (11)
  assert.equal((await inicio('10230')).json().asignadas, 7)
  // Laura (Gerente) tiene a todo Liquid Cooling: actividades 1-14
  assert.equal((await inicio('10001')).json().asignadas, 14)
})

test('inicio con número inválido o inexistente', async () => {
  assert.equal((await inicio('abc')).statusCode, 400)
  assert.equal((await inicio('99999')).statusCode, 401) // nadie puede tener sesión con ese número
})

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
  assert.equal((await pedir(app, 'GET', '/api/equipo/99999')).code, 401)
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

// hoy por defecto = el día de los datos de prueba, para que las fechas esperadas no dependan del reloj
const heredar = (app, id, por, para, hoy = '2026-10-29') => pedir(app, 'POST', `/api/actividades/${id}/heredar`, { por, para, hoy })

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
  const b = (await heredar(app, 9, '10251', '10547', '2026-10-28')).body
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
  assert.equal(filas[0].at, '2026-10-29T12:31:00.000Z')
  assert.equal(filas.find((f) => f.id === 4).inh, true)
  assert.deepEqual([filas[0].no, filas[0].doneAt], ['10490', '2026-10-29T12:31:00.000Z']) // la 6, realizada; sin doneAt usa su hora de registro
  assert.equal(filas.find((f) => f.id === 5).doneAt, undefined) // en proceso
  assert.equal((await reporte({ turno: 'B' })).body.length, 0)
  assert.equal((await reporte({ desde: '2026-10-30', hasta: '2026-10-31' })).body.length, 0)
  await heredar(app, 3, '10230', '10490')
  assert.equal((await reporte()).body.find((f) => f.id === 3).heredadaA, 'María López')
  assert.equal((await reporte({ empleados: ['10511'] })).code, 403) // no es de su equipo
  assert.equal((await reporte({ por: '10482' })).code, 403)
  assert.equal((await reporte({ empleados: [] })).code, 400)
})

const CLAVE = 'Nueva#Clave2026'
const HOY_REAL = new Date().toISOString().slice(0, 10)
const CDMX = 'hoy=2026-11-02&zona=America/Mexico_City'
const registro = (cambios = {}) => ({
  name: 'Ana Prueba', no: '20001', email: 'ana.prueba@empresa.com', role: 'tec', dept: 'lc', shift: 'B', boss: '10251', password: CLAVE, ...cambios,
})

test('registro de técnico: elige encargado del departamento, hereda su área y ya puede entrar', async () => {
  const app = build()
  const res = await pedir(app, 'POST', '/api/registro', registro())
  assert.equal(res.code, 201)
  const yo = (await entrar('20001', CLAVE, app)).json()
  assert.deepEqual([yo.name, yo.area, yo.encargado], ['Ana Prueba', 'CDU y Chillers', false])
  // Aparece en el equipo de Sofía y en Departamentos
  assert.ok((await pedir(app, 'GET', '/api/equipo/10251')).body.some((e) => e.no === '20001'))
  const jorge = await sesionDe(app, '10482') // mismo departamento
  assert.equal((await conCookie(app, 'GET', `/api/departamentos?${CDMX}`, jorge)).json().find((e) => e.no === '20001').rate, null) // sin actividades
})

test('registro valida duplicados, contraseña y encargado', async () => {
  const app = build()
  const codigo = async (cambios) => (await pedir(app, 'POST', '/api/registro', registro(cambios))).code
  assert.equal(await codigo({ no: '10482' }), 409)
  assert.equal(await codigo({ email: 'JORGE.salinas@empresa.com' }), 409)
  for (const password of ['Corta#1', 'sinmayuscula#2026', 'SINMINUSCULA#2026', 'SinNumero#Clave', 'SinSimbolo2026x']) {
    assert.equal(await codigo({ password }), 400, password)
  }
  assert.equal(await codigo({ boss: undefined }), 400) // técnico sin encargado
  assert.equal(await codigo({ boss: '10482' }), 400) // un técnico no es encargado
  assert.equal(await codigo({ boss: '10700' }), 400) // encargado de otro departamento
  assert.equal(await codigo({ role: 'full', boss: undefined }), 400) // encargado sin área
  assert.equal(await codigo({ role: 'full', boss: undefined, area: 'Línea 4' }), 201)
  assert.equal(await codigo({ email: 'no-es-correo', no: '20002' }), 400)
})

test('recuperar contraseña: valida número y correo, el permiso es de un solo uso', async () => {
  const app = build()
  assert.equal((await pedir(app, 'POST', '/api/recuperar', { no: '10482', email: 'otro@empresa.com' })).code, 400)
  const { body } = await pedir(app, 'POST', '/api/recuperar', { no: '10482', email: ' Jorge.Salinas@empresa.com ' })
  assert.equal(body.name, 'Jorge Salinas')
  assert.equal((await pedir(app, 'POST', '/api/recuperar/cambiar', { token: body.token, password: 'debil' })).code, 400)
  assert.equal((await pedir(app, 'POST', '/api/recuperar/cambiar', { token: body.token, password: CLAVE })).code, 200)
  assert.equal((await pedir(app, 'POST', '/api/recuperar/cambiar', { token: body.token, password: CLAVE })).code, 401)
  assert.equal((await login({ usuario: '10482', password: 'demo1234' }, app)).statusCode, 401)
  assert.equal((await entrar('10482', CLAVE, app)).statusCode, 200)
})

test('perfil y cambio de contraseña propio', async () => {
  const app = build()
  const perfil = (await pedir(app, 'GET', '/api/perfil/10482')).body
  assert.deepEqual([perfil.bossName, perfil.email, perfil.password], ['Diego Herrera', 'jorge.salinas@empresa.com', undefined])
  assert.equal(typeof perfil.diasPassword, 'number')
  const cambiar = (actual, nueva) => pedir(app, 'POST', '/api/perfil/10482/password', { actual, nueva })
  assert.equal((await cambiar('mala', CLAVE)).code, 401)
  assert.equal((await cambiar('demo1234', 'debil')).code, 400)
  assert.equal((await cambiar('demo1234', CLAVE)).code, 200)
  assert.equal((await cambiar(CLAVE, CLAVE)).code, 400) // debe ser distinta
  assert.equal((await pedir(app, 'GET', '/api/perfil/10482')).body.diasPassword, 90)
  assert.equal((await pedir(app, 'GET', '/api/perfil/99999')).code, 401)
})

test('departamentos: solo el propio, sin datos sensibles; el rate solo con hoy y zona', async () => {
  const app = build()
  const de = async (no, q = '') => (await conCookie(app, 'GET', `/api/departamentos${q}`, await sesionDe(app, no))).json()
  const lc = await de('10482')
  assert.equal(lc.length, 10)
  assert.ok(lc.every((e) => e.dept === 'lc'))
  assert.deepEqual(Object.keys(lc[0]).sort(), ['area', 'dept', 'name', 'no', 'role', 'shift'])
  assert.deepEqual((await de('10604')).map((e) => e.no), ['10700', '10620', '10604']) // Pruebas Funcionales
  assert.ok('rate' in (await de('10482', `?${CDMX}`))[0])
  assert.equal((await conCookie(app, 'GET', '/api/departamentos', undefined)).statusCode, 401)
  // Registro, sin sesión, solo ve a los encargados
  const encargados = (await conCookie(app, 'GET', '/api/encargados', undefined)).json()
  assert.deepEqual(Object.keys(encargados[0]).sort(), ['dept', 'name', 'no', 'role'])
  assert.ok(encargados.every((e) => ['gte', 'sr', 'full'].includes(e.role)))
})

test('rate de aprobación: realizadas a tiempo en los últimos 30 días, en la hora local', async () => {
  const app = build()
  const rate = async (no, q = CDMX) => (await pedir(app, 'GET', `/api/perfil/${no}?${q}`)).body.rate
  // Jorge, 2 nov: de sus 4 del 29 oct solo la 1 está realizada (ese mismo día) → 25 %
  assert.equal(await rate('10482'), 25)
  // Realizar hoy una del 29 oct no la hace "a tiempo"
  await pedir(app, 'PATCH', '/api/actividades/3', { por: '10482', estado: 'done', avance: 100 })
  assert.equal(await rate('10482'), 25)
  // Una de hoy abierta todavía no cuenta; realizada hoy, sí y a tiempo → 2 de 5
  await pedir(app, 'POST', '/api/actividades', asignar({ fecha: '2026-11-02', puntos: [{ texto: 'Hoy', avance: 0 }] }))
  assert.equal(await rate('10482'), 25)
  await pedir(app, 'POST', '/api/actividades', asignar({ fecha: '2026-11-02', puntos: [{ texto: 'Hoy hecha', avance: 100 }] }))
  assert.equal(await rate('10482'), 40)
  // Fuera de los 30 días ya no cuenta nada
  assert.equal(await rate('10482', 'hoy=2026-12-15&zona=America/Mexico_City'), null)
  // Héctor terminó la 10 (del 28 oct) a las 23:10 de Ciudad de México = 29 oct en UTC
  assert.equal(await rate('10547'), 100)
  assert.equal(await rate('10547', 'hoy=2026-11-02&zona=UTC'), 0)
  // Sin hoy y zona no hay rate; zona inventada → 400
  assert.equal(await rate('10482', ''), undefined)
  assert.equal((await pedir(app, 'GET', '/api/perfil/10482?hoy=2026-11-02&zona=Marte/Base')).code, 400)
  // Monitoreo (equipo) también lo trae
  assert.equal((await pedir(app, 'GET', `/api/equipo/10230?${CDMX}`)).body.find((e) => e.no === '10547'), undefined) // Héctor no es de Diego
  assert.equal((await pedir(app, 'GET', `/api/equipo/10251?${CDMX}`)).body.find((e) => e.no === '10547').rate, 100)
})

test('heredar una actividad de días anteriores cuenta desde hoy, no desde su fecha', async () => {
  const app = build()
  // Actividad 3: 29 oct, turno A. Se hereda el 2 nov
  assert.equal((await heredar(app, 3, '10230', '10482', '2026-11-02')).body.date, '2026-11-03')
  // Actividad 9: 28 oct, turno B, a otro empleado: siguiente turno (C) del día de hoy
  const otro = (await heredar(app, 9, '10251', '10547', '2026-11-02')).body
  assert.deepEqual([otro.date, otro.shift], ['2026-11-02', 'C'])
  assert.equal((await pedir(app, 'POST', '/api/actividades/8/heredar', { por: '10112', para: '10533' })).code, 400) // falta hoy
})

test('actualizar con 100 % la marca como realizada', async () => {
  const app = build()
  const { body } = await pedir(app, 'PATCH', '/api/actividades/2', { por: '10482', estado: 'pending', avance: 100 })
  assert.deepEqual([body.status, body.pct], ['done', 100])
  assert.equal((await pedir(app, 'GET', '/api/inicio/10230')).body.notificaciones[0].kind, 'done')
})

test('la fecha del último cambio de contraseña es un instante y los días se cuentan desde él', async () => {
  const app = build()
  await pedir(app, 'POST', '/api/perfil/10482/password', { actual: 'demo1234', nueva: CLAVE })
  const perfil = (await pedir(app, 'GET', '/api/perfil/10482')).body
  assert.ok(Math.abs(Date.parse(perfil.pwdChanged) - Date.now()) < 60_000)
  assert.equal(perfil.diasPassword, 90)
})

test('con desde, Inicio y Equipo muestran solo lo abierto y lo realizado ese día', async () => {
  const app = build()
  const hoy = new Date(Date.now() - 60_000).toISOString() // "hoy" empezó hace un minuto
  const inicioDe = async (no, desde) => (await pedir(app, 'GET', `/api/inicio/${no}${desde ? `?desde=${desde}` : ''}`)).body
  // Jorge: 1 realizada (29 oct) y 3 abiertas. Hoy solo cuentan las abiertas
  assert.deepEqual([(await inicioDe('10482')).asignadas, (await inicioDe('10482', hoy)).asignadas], [4, 3])
  assert.equal((await inicioDe('10482', hoy)).realizadas, 0)
  // Al realizar una hoy, entra en "realizadas hoy" y queda con su instante
  const hecha = (await pedir(app, 'PATCH', '/api/actividades/2', { por: '10482', estado: 'done', avance: 100 })).body
  assert.ok(Date.parse(hecha.doneAt) >= Date.parse(hoy))
  assert.deepEqual([(await inicioDe('10482', hoy)).asignadas, (await inicioDe('10482', hoy)).realizadas], [3, 1])
  // Reabrirla borra el instante; volver a guardarla realizada no lo cambia
  assert.equal((await pedir(app, 'PATCH', '/api/actividades/2', { por: '10482', estado: 'progress', avance: 90 })).body.doneAt, undefined)
  // Registrar al 100 % también cuenta como realizada hoy
  await pedir(app, 'POST', '/api/actividades', asignar({ puntos: [{ texto: 'Lista', avance: 100 }] }))
  assert.equal((await inicioDe('10482', hoy)).realizadas, 1)
  // Equipo (Monitoreo) aplica la misma regla; sin desde trae todo (Registrar, Reportes)
  const jorge = async (desde) => (await pedir(app, 'GET', `/api/equipo/10230${desde ? `?desde=${desde}` : ''}`)).body.find((e) => e.no === '10482')
  assert.ok(!(await jorge(hoy)).actividades.some((a) => a.id === 1))
  assert.ok((await jorge()).actividades.some((a) => a.id === 1))
  assert.equal((await pedir(app, 'GET', '/api/inicio/10482?desde=ayer')).code, 400)
})

test('avisos automáticos: atrasadas al ejecutor y a quien asignó, contraseña por vencer, sin duplicar', async () => {
  const app = build()
  // El servidor solo acepta un hoy a un día del suyo: se usa la fecha real (los datos de prueba ya quedaron atrás)
  const inicioHoy = async (no) => (await pedir(app, 'GET', `/api/inicio/${no}?hoy=${HOY_REAL}`)).body.notificaciones
  const jorge = await inicioHoy('10482')
  // Sus abiertas del 29 oct: 2 y 4 en proceso, 3 pendiente
  const atrasos = jorge.filter((n) => n.kind === 'overdue')
  assert.deepEqual(atrasos.map((n) => n.activityTo).sort(), ['10482', '10482', '10482'])
  assert.ok(atrasos.every((n) => n.who === undefined)) // para el ejecutor: "Tu actividad … está atrasada"
  assert.equal(jorge.filter((n) => n.kind === 'password').length, 1)
  // Diego (quien las asignó) recibe las de su equipo, con el nombre de quién la tiene
  const diego = (await inicioHoy('10230')).filter((n) => n.kind === 'overdue')
  assert.ok(diego.some((n) => n.who === 'Jorge Salinas' && n.actividad === 'Prueba de fuga a 3 unidades en espera'))
  // Volver a consultar no repite avisos
  assert.equal((await inicioHoy('10482')).length, jorge.length)
  // Sin hoy no se generan (Monitoreo, pruebas)
  assert.equal((await pedir(build(), 'GET', '/api/inicio/10482')).body.notificaciones.length, 2)
  // La incompleta (9) no cuenta como atrasada: ya avisó al cambiar de estado
  assert.ok(!(await inicioHoy('10511')).some((n) => n.kind === 'overdue'))
})

test('marcar una notificación como leída: solo la propia', async () => {
  const app = build()
  assert.equal((await pedir(app, 'POST', '/api/notificaciones/10482/1/leida')).code, 200)
  const ns = (await pedir(app, 'GET', '/api/inicio/10482')).body.notificaciones
  assert.deepEqual(ns.map((n) => [n.id, n.read]), [[2, false], [1, true]])
  assert.equal((await pedir(app, 'POST', '/api/notificaciones/10482/3/leida')).code, 404) // la 3 es de Laura
  assert.equal(ns.find((n) => n.id === 2).activityTo, '10482')
})

test('notificaciones ordenadas por fecha, no por id', async () => {
  // En los datos de prueba la 4 (28 oct 22:58) es más vieja que la 3 (29 oct 02:40)
  const ns = (await pedir(build(), 'GET', '/api/inicio/10001')).body.notificaciones
  assert.ok(ns.every((n, i) => i === 0 || ns[i - 1].at >= n.at))
  assert.deepEqual(ns.slice(-2).map((n) => n.id), [3, 4])
})

test('cambiar la contraseña deja leído el aviso de vencimiento', async () => {
  const app = build()
  const aviso = async () => (await pedir(app, 'GET', `/api/inicio/10482?hoy=${HOY_REAL}`)).body.notificaciones.find((n) => n.kind === 'password')
  assert.equal((await aviso()).read, false)
  await pedir(app, 'POST', '/api/perfil/10482/password', { actual: 'demo1234', nueva: CLAVE })
  assert.equal((await aviso()).read, true)
  // También al recuperarla
  const { body } = await pedir(app, 'POST', '/api/recuperar', { no: '10490', email: 'maria.lopez@empresa.com' })
  await pedir(app, 'GET', `/api/inicio/10490?hoy=${HOY_REAL}`)
  await pedir(app, 'POST', '/api/recuperar/cambiar', { token: body.token, password: CLAVE })
  const cookie = cookieDe(await entrar('10490', CLAVE, app))
  const { notificaciones } = (await app.inject({ method: 'GET', url: '/api/inicio/10490', headers: { cookie } })).json()
  assert.ok(notificaciones.filter((n) => n.kind === 'password').every((n) => n.read))
})

const conCookie = (app, method, url, cookie, payload) => app.inject({ method, url, payload, ...(cookie && { headers: { cookie } }) })

test('sesión: cookie HttpOnly al entrar, sin sesión no hay datos y al recargar dice quién eres', async () => {
  const app = build()
  const res = await entrar('10482', 'demo1234', app)
  assert.match(res.headers['set-cookie'], /^sesion=[\w-]+; HttpOnly; SameSite=Strict; Path=\/$/)
  const cookie = cookieDe(res)
  assert.equal((await conCookie(app, 'GET', '/api/sesion', cookie)).json().name, 'Jorge Salinas')
  for (const c of [undefined, 'sesion=inventada', 'otra=1']) {
    const r = await conCookie(app, 'GET', '/api/inicio/10482', c)
    assert.deepEqual([r.statusCode, r.json().sesion], [401, false], String(c))
  }
  assert.equal((await conCookie(app, 'GET', '/api/sesion', undefined)).statusCode, 401)
  // Las públicas no la piden
  assert.equal((await conCookie(app, 'GET', '/api/encargados', undefined)).statusCode, 200)
})

test('sesión: no se puede actuar como otro empleado', async () => {
  const app = build()
  const jorge = await sesionDe(app, '10482')
  for (const [method, url, payload] of [
    ['GET', '/api/inicio/10230'], ['GET', '/api/perfil/10230'], ['GET', '/api/equipo/10230'], ['GET', '/api/actividades/10490'],
    ['POST', '/api/notificaciones/10230/leidas'], ['POST', '/api/actividades', asignar()],
    ['PATCH', '/api/actividades/1', { por: '10490', estado: 'done', avance: 100, nota: '' }],
    ['POST', '/api/reportes', { por: '10230', empleados: ['10482'], desde: '2026-10-01', hasta: '2026-10-31' }],
  ]) {
    const r = await conCookie(app, method, url, jorge, payload)
    assert.deepEqual([r.statusCode, r.json().error], [403, 'Solo puedes actuar con tu propia cuenta.'], url)
  }
})

test('sesión: cerrar sesión, vencer por inactividad y cambio de contraseña', async () => {
  mock.timers.enable({ apis: ['Date'], now: Date.now() })
  try {
    const app = build()
    const pide = (cookie) => conCookie(app, 'GET', '/api/sesion', cookie).then((r) => r.statusCode)
    // Cerrar sesión borra la cookie y la sesión del servidor
    const a = await sesionDe(app, '10482')
    const salir = await conCookie(app, 'POST', '/api/logout', a)
    assert.match(salir.headers['set-cookie'], /^sesion=; .*Max-Age=0$/)
    assert.equal(await pide(a), 401)
    // 12 h sin uso la vencen; usarla la renueva
    const b = cookieDe(await entrar('10482', 'demo1234', app))
    mock.timers.tick(11 * 3_600_000)
    assert.equal(await pide(b), 200)
    mock.timers.tick(11 * 3_600_000)
    assert.equal(await pide(b), 200)
    mock.timers.tick(12 * 3_600_000 + 1)
    assert.equal(await pide(b), 401)
    // Cambiar la contraseña desde el perfil cierra las otras sesiones, no la actual
    const [c, d] = [cookieDe(await entrar('10482', 'demo1234', app)), cookieDe(await entrar('10482', 'demo1234', app))]
    const otra = cookieDe(await entrar('10490', 'demo1234', app))
    assert.equal((await conCookie(app, 'POST', '/api/perfil/10482/password', c, { actual: 'demo1234', nueva: CLAVE })).statusCode, 200)
    assert.deepEqual([await pide(c), await pide(d), await pide(otra)], [200, 401, 200])
    // Recuperarla cierra todas
    const { token } = (await conCookie(app, 'POST', '/api/recuperar', undefined, { no: '10482', email: 'jorge.salinas@empresa.com' })).json()
    await conCookie(app, 'POST', '/api/recuperar/cambiar', undefined, { token, password: 'Otra#Clave2026' })
    assert.equal(await pide(c), 401)
  } finally {
    mock.timers.reset()
  }
})

test('un hoy lejano a la fecha del servidor no genera avisos', async () => {
  const app = build()
  const avisos = async (hoy) => (await pedir(app, 'GET', `/api/inicio/10482?hoy=${hoy}`)).body.notificaciones.filter((n) => n.kind === 'overdue').length
  assert.equal(await avisos('2027-06-01'), 0)
  assert.equal(await avisos('2025-01-01'), 0)
  assert.equal(await avisos(HOY_REAL), 3)
})

const propia = (cambios = {}) => ({ por: '10482', texto: 'Purgar línea de retorno', prioridad: 'diaria', avance: 0, hoy: HOY_REAL, ...cambios })
const enUnaHora = () => new Date(Date.now() + 3_600_000).toISOString()

test('tarea propia diaria: con los datos del empleado, aviso a su encargado y sin avisarse a sí mismo', async () => {
  const app = build()
  const { code, body } = await pedir(app, 'POST', '/api/actividades/propia', propia({ avance: 40 }))
  assert.equal(code, 201)
  assert.deepEqual([body.to, body.by, body.shift, body.date, body.status, body.prioridad, body.propia], ['10482', '10482', 'A', HOY_REAL, 'progress', 'diaria', true])
  const aviso = (await pedir(app, 'GET', '/api/inicio/10230')).body.notificaciones[0] // Diego, su encargado
  assert.deepEqual([aviso.kind, aviso.who, aviso.actividad], ['propia', 'Jorge Salinas', 'Purgar línea de retorno'])
  // Al actualizarla avisa a su encargado, no a él mismo
  await pedir(app, 'PATCH', `/api/actividades/${body.id}`, { por: '10482', estado: 'done', avance: 100, nota: 'Listo' })
  assert.deepEqual((await pedir(app, 'GET', '/api/inicio/10230')).body.notificaciones.slice(0, 2).map((n) => n.kind).sort(), ['comment', 'done'])
  assert.ok(!(await pedir(app, 'GET', '/api/inicio/10482')).body.notificaciones.some((n) => n.actividad === 'Purgar línea de retorno'))
})

test('tarea propia: solo técnico / Ing. Jr y con datos válidos', async () => {
  const app = build()
  const codigo = async (cambios) => (await pedir(app, 'POST', '/api/actividades/propia', propia(cambios))).code
  assert.equal(await codigo({ por: '10230' }), 403) // Ing. Full
  assert.equal(await codigo({ por: '10490' }), 201) // Ing. Jr
  assert.equal(await codigo({ texto: '  ' }), 400)
  assert.equal(await codigo({ avance: 101 }), 400)
  assert.equal(await codigo({ prioridad: 'normal' }), 400)
  assert.equal(await codigo({ hoy: '2030-01-01' }), 400)
  assert.equal(await codigo({ prioridad: 'urgente' }), 400) // sin cierre de turno
  assert.equal(await codigo({ prioridad: 'urgente', cierre: new Date(Date.now() - 60_000).toISOString() }), 400) // ya pasó
  assert.equal(await codigo({ prioridad: 'urgente', cierre: new Date(Date.now() + 2 * 86_400_000).toISOString() }), 400)
})

test('urgente: va primero, no se hereda y al cerrar el turno queda fija', async () => {
  const app = build()
  const urgente = (await pedir(app, 'POST', '/api/actividades/propia', propia({ prioridad: 'urgente', avance: 60, cierre: enUnaHora() }))).body
  const lista = async () => (await pedir(app, 'GET', '/api/actividades/10482')).body
  assert.equal((await lista())[0].id, urgente.id)
  assert.equal((await pedir(app, 'POST', `/api/actividades/${urgente.id}/heredar`, { por: '10230', para: '10490', hoy: HOY_REAL })).code, 409)
  // Una urgente terminada antes del cierre queda realizada
  const hecha = (await pedir(app, 'POST', '/api/actividades/propia', propia({ prioridad: 'urgente', avance: 100, cierre: enUnaHora() }))).body

  mock.timers.enable({ apis: ['Date'], now: Date.now() + 2 * 3_600_000 }) // dos horas después: el turno ya cerró
  try {
    const cerrada = (await lista()).find((a) => a.id === urgente.id)
    assert.deepEqual([cerrada.status, cerrada.pct, cerrada.cerrada], ['incomplete', 60, true])
    assert.equal((await lista()).find((a) => a.id === hecha.id).status, 'done')
    assert.equal((await pedir(app, 'PATCH', `/api/actividades/${urgente.id}`, { por: '10482', estado: 'done', avance: 100 })).code, 409)
    // Avisos: al empleado (sin quién) y a su encargado (con quién); la realizada no avisa
    assert.equal((await pedir(app, 'GET', '/api/inicio/10482')).body.notificaciones.filter((n) => n.kind === 'urgent-closed').length, 1)
    const jefe = (await pedir(app, 'GET', '/api/inicio/10230')).body.notificaciones.filter((n) => n.kind === 'urgent-closed')
    assert.deepEqual(jefe.map((n) => n.who), ['Jorge Salinas'])
  } finally {
    mock.timers.reset()
  }
})

test('aviso de atraso de una tarea propia: al empleado y a su encargado, no dos veces al empleado', async () => {
  const app = build()
  const ayer = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const { body } = await pedir(app, 'POST', '/api/actividades/propia', propia({ hoy: ayer }))
  await pedir(app, 'GET', `/api/inicio/10482?hoy=${HOY_REAL}`)
  const deEsta = async (no) => (await pedir(app, 'GET', `/api/inicio/${no}`)).body.notificaciones.filter((n) => n.kind === 'overdue' && n.actividad === body.text)
  assert.equal((await deEsta('10482')).length, 1)
  assert.equal((await deEsta('10230')).length, 1)
})

test('asignar urgente: el encargado la marca aparte, con el cierre del turno elegido; no se hereda', async () => {
  const app = build()
  const { code, body } = await pedir(app, 'POST', '/api/actividades', asignar({ prioridad: 'urgente', cierre: enUnaHora(), puntos: [{ texto: 'Fuga en LC245-02', avance: 0 }] }))
  assert.equal(code, 201)
  assert.deepEqual([body[0].prioridad, typeof body[0].cierreTurno], ['urgente', 'string'])
  assert.equal((await heredar(app, body[0].id, '10230', '10482', HOY_REAL)).code, 409)
  // Diaria es el estándar: sin prioridad
  assert.equal((await pedir(app, 'POST', '/api/actividades', asignar())).body[0].prioridad, undefined)
  for (const cierre of [undefined, new Date(Date.now() - 60_000).toISOString(), new Date(Date.now() + 2 * 86_400_000).toISOString()]) {
    assert.equal((await pedir(app, 'POST', '/api/actividades', asignar({ prioridad: 'urgente', cierre }))).code, 400, String(cierre))
  }
})

test('matriz: yield de diarias y urgentes, tiempo extra y asistencia del checador', async () => {
  mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-03T15:00:00Z') })
  try {
    const app = build()
    const matriz = (no, q) => pedir(app, 'GET', `/api/matriz/${no}?hoy=2026-11-03&${q}`)
    const { code, body } = await matriz('10230', 'desde=2026-10-26&hasta=2026-11-03')
    assert.equal(code, 200)
    assert.deepEqual(body.map((f) => f.no), ['10490', '10482']) // su rama, por puesto
    const jorge = body.find((f) => f.no === '10482')
    // 29 oct: 4 diarias, 1 realizada. Hasta ayer: salidas después de las 14:30 suman 517 min; 6 de 6 días hábiles
    assert.deepEqual([jorge.diarias, jorge.urgentes, jorge.extra, jorge.asistencia], [[1, 4], [0, 0], 517, [6, 6]])
    const maria = body.find((f) => f.no === '10490')
    assert.deepEqual([maria.extra, maria.asistencia], [455, [5, 6]]) // faltó el 30 oct
    // Una urgente abierta aún no cuenta; al cerrar el turno sí
    await pedir(app, 'POST', '/api/actividades/propia', propia({ prioridad: 'urgente', avance: 40, hoy: '2026-11-03', cierre: enUnaHora() }))
    const urgentes = async () => (await matriz('10230', 'desde=2026-10-26&hasta=2026-11-03')).body.find((f) => f.no === '10482').urgentes
    assert.deepEqual(await urgentes(), [0, 0])
    mock.timers.tick(2 * 3_600_000)
    assert.deepEqual(await urgentes(), [0, 1])
    // El gerente ve toda su rama; un técnico no tiene matriz; hasta en el futuro se corta en hoy
    assert.equal((await matriz('10001', 'desde=2026-10-26&hasta=2026-11-03')).body.length, 9)
    assert.equal((await matriz('10482', 'desde=2026-10-26&hasta=2026-11-03')).code, 403)
    assert.equal((await matriz('10230', 'desde=2026-10-26&hasta=2026-12-31')).code, 200)
    assert.equal((await matriz('10230', 'desde=2026-11-04&hasta=2026-11-10')).code, 400)
    assert.equal((await matriz('10230', 'desde=2026-10-26')).code, 400)
  } finally {
    mock.timers.reset()
  }
})
