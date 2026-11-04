import { mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { build, siguienteFecha, totp } from './app.js'

const login = (payload, app = build()) => app.inject({ method: 'POST', url: '/api/login', payload })
// Clave TOTP de cada cuenta por instancia de la app (el primer login la entrega para darla de alta) y último paso usado
const mfa = new WeakMap()
// Login completo: usuario y contraseña, luego el código de la app autenticadora
async function entrar(usuario, password = 'demo1234', app = build()) {
  const res = await login({ usuario, password }, app)
  const paso1 = res.json()
  if (paso1.name) return res // cuenta de prueba: entra sin el código de la app
  if (!mfa.has(app)) mfa.set(app, new Map())
  const cuenta = mfa.get(app).get(usuario) ?? { ultimo: -1 }
  if (paso1.secreto) cuenta.secreto = paso1.secreto
  mfa.get(app).set(usuario, cuenta)
  // Un código sirve una vez: si en estos 30 s ya se usó, se toma el del siguiente paso (el servidor tolera +30 s)
  cuenta.ultimo = Math.max(Math.floor(Date.now() / 30_000), cuenta.ultimo + 1)
  const codigo = cuenta.secreto ? totp(cuenta.secreto, cuenta.ultimo) : '000000'
  return app.inject({ method: 'POST', url: '/api/login/verificar', payload: { token: paso1.token, codigo } })
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
  const no = payload?.por ?? url.match(/^\/api\/(?:inicio|actividades|perfil|equipo|notificaciones|matriz|herencias|guardadas)\/(\d{5})/)?.[1]
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

test('cuentas de prueba: entran directo por correo, alias o número, sin el código de la app', async () => {
  for (const usuario of ['jorge.salinas@empresa.com', ' Jorge.Salinas ', '10482']) {
    const res = await login({ usuario, password: 'demo1234' })
    assert.equal(res.statusCode, 200, usuario)
    assert.deepEqual([res.json().name, res.json().token, res.json().password], ['Jorge Salinas', undefined, undefined])
    assert.match(res.headers['set-cookie'], /^sesion=/)
  }
})

test('acceso por tipo: Gerencia (Gerente, Senior, Ing. Full) o Jr / Técnico', async () => {
  const app = build()
  assert.equal((await login({ usuario: '10001', password: 'demo1234', tipo: 'gerencia' }, app)).statusCode, 200)
  assert.equal((await login({ usuario: '10230', password: 'demo1234', tipo: 'gerencia' }, app)).statusCode, 200) // Ing. Full
  const mal = await login({ usuario: '10482', password: 'demo1234', tipo: 'gerencia' }, app)
  assert.deepEqual([mal.statusCode, mal.json().error], [403, 'Esta cuenta es de Jr / Técnico: entra por ese acceso.'])
  assert.equal((await login({ usuario: '10112', password: 'demo1234', tipo: 'operativo' }, app)).json().error, 'Esta cuenta es de Gerencia: entra por ese acceso.')
  assert.equal((await login({ usuario: '10482', password: 'mala', tipo: 'gerencia' }, app)).statusCode, 401) // primero la contraseña
})

test('TOTP: vector de prueba del RFC 6238', () => {
  // Clave ASCII "12345678901234567890" en base32; a los 59 s (paso 1) el código de 8 dígitos es 94287082
  assert.equal(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1), '287082')
})

test('MFA: alta en el primer login, luego solo el código de la app; incorrecto, reutilizado, 5 intentos', async () => {
  // Una cuenta real (registrada), no de prueba
  const app = build()
  const clave = 'Nueva#Clave2026'
  for (const [no, email] of [['20001', 'ana.prueba@empresa.com'], ['20002', 'otra@empresa.com']]) {
    const cuenta = { name: 'Ana Prueba', no, email, role: 'tec', dept: 'lc', shift: 'B', boss: '10251', password: clave }
    assert.equal((await app.inject({ method: 'POST', url: '/api/registro', payload: cuenta })).statusCode, 201)
  }
  const verificar = (token, codigo) => app.inject({ method: 'POST', url: '/api/login/verificar', payload: { token, codigo } })
  const alta = (await login({ usuario: 'ana.prueba@empresa.com', password: clave }, app)).json()
  // Primera vez: la clave para dar de alta la app autenticadora (y nunca un código ya hecho ni la sesión)
  assert.match(alta.secreto, /^[A-Z2-7]{32}$/)
  assert.match(alta.uri, /^otpauth:\/\/totp\/Seguimiento%20de%20Actividades%3Aana\.prueba%40empresa\.com\?secret=[A-Z2-7]{32}&issuer=/)
  assert.deepEqual([alta.codigo, alta.name], [undefined, undefined])
  const malo = (c) => String((Number(c) + 1) % 1_000_000).padStart(6, '0')
  assert.equal((await verificar(alta.token, malo(totp(alta.secreto)))).json().error, 'Código incorrecto.')
  assert.equal((await verificar(alta.token, totp(alta.secreto))).statusCode, 200)

  // Ya dada de alta: no vuelve a entregar la clave, y el código que se acaba de usar no sirve otra vez
  const otro = (await login({ usuario: '20001', password: clave }, app)).json()
  assert.equal(otro.secreto, undefined)
  assert.equal((await verificar(otro.token, totp(alta.secreto))).statusCode, 401)
  assert.equal((await verificar(otro.token, totp(alta.secreto, Math.floor(Date.now() / 30_000) + 1))).statusCode, 200)

  // Una clave de alta que no se confirmó no queda guardada; 5 intentos fallidos cierran la verificación
  const tercero = (await login({ usuario: '20001', password: clave }, app)).json()
  for (let i = 0; i < 4; i++) await verificar(tercero.token, '000000')
  assert.match((await verificar(tercero.token, '000000')).json().error, /Demasiados intentos/)
  assert.equal((await verificar(tercero.token, totp(alta.secreto))).statusCode, 401)
  assert.equal((await verificar('no-existe', '123456')).statusCode, 401)
  assert.equal((await verificar(otro.token, '12ab56')).statusCode, 400)
  // Las claves de cada cuenta son distintas
  assert.notEqual((await login({ usuario: '20002', password: clave }, app)).json().secreto, alta.secreto)
})

test('bloqueos: por cuenta (no por lo escrito), los códigos fallidos cuentan y recuperar pide el código de la app', async () => {
  const app = build()
  // Número y correo son la misma cuenta: 5 + 5 intentos la bloquean
  for (let i = 0; i < 5; i++) await login({ usuario: '10490', password: 'mala' }, app)
  for (let i = 0; i < 5; i++) await login({ usuario: 'maria.lopez@empresa.com', password: 'mala' }, app)
  assert.equal((await login({ usuario: 'maria.lopez', password: 'demo1234' }, app)).statusCode, 429)

  // Cuenta real con la app vinculada
  const ana = { name: 'Ana Prueba', no: '20001', email: 'ana.prueba@empresa.com', role: 'tec', dept: 'lc', shift: 'B', boss: '10251', password: CLAVE }
  await app.inject({ method: 'POST', url: '/api/registro', payload: ana })
  await app.inject({ method: 'POST', url: '/api/registro', payload: { ...ana, no: '20002', email: 'sin.app@empresa.com' } })
  const verificar = (token, codigo) => app.inject({ method: 'POST', url: '/api/login/verificar', payload: { token, codigo } })
  const alta = (await login({ usuario: '20001', password: CLAVE }, app)).json()
  const paso = Math.floor(Date.now() / 30_000)
  assert.equal((await verificar(alta.token, totp(alta.secreto, paso - 1))).statusCode, 200)
  const recuperar = (cuerpo) => app.inject({ method: 'POST', url: '/api/recuperar', payload: { no: '20001', email: 'ana.prueba@empresa.com', ...cuerpo } })
  assert.equal((await recuperar()).statusCode, 401) // sin código
  assert.equal((await recuperar({ codigo: totp(alta.secreto, paso - 1) })).statusCode, 401) // ya usado
  assert.equal((await recuperar({ codigo: totp(alta.secreto, paso) })).statusCode, 200)
  // Sin la app vinculada no se recupera sola
  assert.match((await app.inject({ method: 'POST', url: '/api/recuperar', payload: { no: '20002', email: 'sin.app@empresa.com' } })).json().error, /super administrador/)

  // Los códigos fallidos suman al bloqueo del login: no se puede pedir otra verificación y seguir probando
  for (let vuelta = 0; vuelta < 2; vuelta++) {
    const { token } = (await login({ usuario: '20001', password: CLAVE }, app)).json()
    for (let i = 0; i < 5; i++) await verificar(token, '000000')
  }
  assert.equal((await login({ usuario: '20001', password: CLAVE }, app)).statusCode, 429)
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
  assert.deepEqual([d.asignadas, d.realizadas, d.abiertas, d.avance], [4, 1, 1, 25]) // avance: % realizadas
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
  puntos: [{ texto: 'Revisar bomba' }, { texto: 'Cambiar filtro' }], comentario: 'Urgente', ...cambios,
})

test('equipo asignable: solo encargados y solo empleados de menor rango', async () => {
  const app = build()
  assert.deepEqual((await pedir(app, 'GET', '/api/equipo/10230')).body.map((e) => e.no), ['10490', '10482'])
  // Laura (Gerente) puede asignar a Seniors, Fulls, Jrs y Técnicos de toda su rama
  assert.equal((await pedir(app, 'GET', '/api/equipo/10001')).body.length, 9)
  assert.equal((await pedir(app, 'GET', '/api/equipo/10482')).code, 403)
  assert.equal((await pedir(app, 'GET', '/api/equipo/99999')).code, 401)
})

test('registrar crea una actividad por punto, pendiente, y notifica al ejecutor', async () => {
  const app = build()
  const { code, body } = await pedir(app, 'POST', '/api/actividades', asignar())
  assert.equal(code, 201)
  assert.deepEqual(body.map((a) => [a.id, a.status, a.mgr]), [[15, 'pending', 'Urgente'], [16, 'pending', 'Urgente']])
  const mias = (await pedir(app, 'GET', '/api/actividades/10482')).body
  assert.equal(mias.length, 6)
  assert.equal(mias[0].text, 'Cambiar filtro') // la más nueva primero
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
  assert.equal(await codigo({ puntos: [{ texto: '  ' }] }), 400)
  assert.equal(await codigo({ fecha: '31/10/2026' }), 400)
  assert.equal(await codigo({ turno: 'D' }), 400)
})

test('actualizar: solo el asignado, realizada fuerza 100 % y notifica estado y comentario al encargado', async () => {
  const app = build()
  const actualizar = (id, body) => pedir(app, 'PATCH', `/api/actividades/${id}`, body)
  assert.equal((await actualizar(3, { por: '10490', estado: 'done' })).code, 403)
  assert.equal((await actualizar(999, { por: '10482', estado: 'done' })).code, 404)
  assert.equal((await actualizar(3, { por: '10482', estado: 'otro' })).code, 400)

  const { code, body } = await actualizar(3, { por: '10482', estado: 'done', nota: 'Listo' })
  assert.equal(code, 200)
  assert.deepEqual([body.status, body.pct, body.note], ['done', 100, 'Listo'])
  const avisos = (await pedir(app, 'GET', '/api/inicio/10230')).body.notificaciones.slice(0, 2)
  assert.deepEqual(avisos.map((n) => n.kind), ['comment', 'done'])

  // Sin cambios de estado ni de nota, no se notifica nada
  await actualizar(3, { por: '10482', estado: 'done', nota: 'Listo' })
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
const heredar = (app, id, por, para, hoy = '2026-10-29', motivo = 'Falta refacción') =>
  pedir(app, 'POST', `/api/actividades/${id}/heredar`, { por, para, hoy, motivo })
// Reloj simulado para la prueba: las fechas "hoy" que manda el navegador deben estar a un día o menos del servidor
const reloj = (t, iso) => {
  mock.timers.enable({ apis: ['Date'], now: Date.parse(iso) })
  t.after(() => mock.timers.reset())
}

test('equipo trae jefe y actividades vigentes de cada miembro', async () => {
  const jorge = (await pedir(build(), 'GET', '/api/equipo/10230')).body.find((e) => e.no === '10482')
  assert.equal(jorge.boss, '10230')
  assert.deepEqual(jorge.actividades.map((a) => a.id), [4, 3, 2, 1])
})

test('heredar al mismo empleado: día siguiente, mismo turno; la original sale de listas e indicadores', async (t) => {
  reloj(t, '2026-10-29T15:00:00Z')
  const app = build()
  const r = await heredar(app, 3, '10230', '10482')
  assert.equal(r.code, 201)
  assert.deepEqual([r.body.estado, r.body.motivo], ['aceptada', 'Falta refacción']) // Diego es su encargado: entra directo
  const body = r.body.creada
  assert.deepEqual([body.to, body.by, body.date, body.shift, body.status, body.inh], ['10482', '10230', '2026-10-30', 'A', 'pending', true])
  const ids = (await pedir(app, 'GET', '/api/actividades/10482')).body.map((a) => a.id)
  assert.ok(ids.includes(body.id) && !ids.includes(3))
  const inicio = (await pedir(app, 'GET', '/api/inicio/10482')).body
  assert.deepEqual([inicio.asignadas, inicio.abiertas], [4, 1]) // no se cuenta dos veces
  assert.deepEqual([inicio.notificaciones[0].kind, inicio.notificaciones[0].actividad], ['inherited', 'Actualizar hoja de WIP de la estación'])
  assert.equal((await pedir(app, 'PATCH', '/api/actividades/3', { por: '10482', estado: 'done' })).code, 409)
  assert.equal((await heredar(app, 3, '10230', '10482')).code, 409) // una sola vez
})

test('heredar a otro empleado: siguiente turno; del C pasa al A del día siguiente', async (t) => {
  reloj(t, '2026-10-29T15:00:00Z')
  const app = build()
  // Luis (turno B, incompleta) → Héctor: mismo día, turno C
  const b = (await heredar(app, 9, '10251', '10547', '2026-10-28')).body.creada
  assert.deepEqual([b.to, b.date, b.shift, b.pct], ['10547', '2026-10-28', 'C', 65])
  // Una actividad del turno C heredada a otro pasa al turno A del día siguiente
  const [c] = (await pedir(app, 'POST', '/api/actividades', asignar({ turno: 'C', fecha: '2026-10-31', puntos: [{ texto: 'Ronda nocturna' }] }))).body
  const a = (await heredar(app, c.id, '10230', '10490')).body.creada
  assert.deepEqual([a.to, a.date, a.shift], ['10490', '2026-11-01', 'A'])
})

test('heredar valida permisos, estado, puesto y turno', async (t) => {
  reloj(t, '2026-10-29T15:00:00Z')
  const app = build()
  assert.equal((await heredar(app, 9, '10230', '10482')).code, 403) // Luis no es del equipo de Diego
  assert.equal((await heredar(app, 3, '10482', '10482')).code, 403) // un técnico no hereda
  const puesto = await heredar(app, 3, '10230', '10251') // de técnico a Ing. Full (turno B): otro nivel
  assert.deepEqual([puesto.code, puesto.body.error], [400, 'Solo se hereda entre puestos del mismo nivel: técnico e Ing. Jr, o Ing. Full y Senior.'])
  const turno = await heredar(app, 3, '10230', '10490') // María es del mismo turno A, no del siguiente
  assert.deepEqual([turno.code, turno.body.error], [400, 'Quien recibe debe ser del turno siguiente (o el mismo empleado, al día siguiente).'])
  assert.equal((await heredar(app, 1, '10230', '10482')).code, 409) // ya realizada
  assert.equal((await heredar(app, 999, '10230', '10482')).code, 404)
  assert.equal((await heredar(app, 3, '10230', '10482', '2030-01-01')).code, 400) // fecha del equipo inválida
  assert.equal((await pedir(app, 'POST', '/api/actividades/3/heredar', { por: '10230', para: '10482', hoy: '2026-10-29' })).code, 400) // sin motivo
})

test('reportes: filtra por empleados, fechas y turno, y muestra la acción tomada', async (t) => {
  reloj(t, '2026-10-29T15:00:00Z')
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
  await heredar(app, 3, '10230', '10482')
  assert.equal((await reporte()).body.find((f) => f.id === 3).heredadaA, 'Jorge Salinas')
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
  const sofia = await sesionDe(app, '10251') // su encargada
  assert.equal((await conCookie(app, 'GET', `/api/departamentos?${CDMX}`, sofia)).json().find((e) => e.no === '20001').rate, null) // sin actividades
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

test('departamentos: solo el propio y solo encargados, sin datos sensibles; el rate solo con hoy y zona', async () => {
  const app = build()
  const de = async (no, q = '') => (await conCookie(app, 'GET', `/api/departamentos${q}`, await sesionDe(app, no))).json()
  assert.equal((await de('10482')).error, 'Solo los encargados ven la plantilla.') // técnico
  const lc = await de('10230')
  assert.equal(lc.length, 10)
  assert.ok(lc.every((e) => e.dept === 'lc'))
  assert.deepEqual(Object.keys(lc[0]).sort(), ['area', 'dept', 'name', 'no', 'role', 'shift'])
  assert.deepEqual((await de('10620')).map((e) => e.no), ['10700', '10620', '10604']) // Pruebas Funcionales
  assert.ok('rate' in (await de('10230', `?${CDMX}`))[0])
  assert.equal((await conCookie(app, 'GET', '/api/departamentos', undefined)).statusCode, 401)
  // Registro, sin sesión, solo ve a los encargados
  const encargados = (await conCookie(app, 'GET', '/api/encargados', undefined)).json()
  assert.deepEqual(Object.keys(encargados[0]).sort(), ['depts', 'name', 'no', 'role'])
  assert.deepEqual((await conCookie(app, 'GET', '/api/deptos', undefined)).json().map((d) => d.clave), ['lc', 'pf', 'smt'])
  assert.ok(encargados.every((e) => ['gte', 'sr', 'full'].includes(e.role)))
})

test('rate de aprobación: realizadas a tiempo en los últimos 30 días, en la hora local', async (t) => {
  // "Hoy" es el 2 nov en Ciudad de México: lo realizado ahora cae en ese día local
  mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-02T18:00:00Z') })
  t.after(() => mock.timers.reset())
  const app = build()
  const rate = async (no, q = CDMX) => (await pedir(app, 'GET', `/api/perfil/${no}?${q}`)).body.rate
  // Jorge, 2 nov: de sus 4 del 29 oct solo la 1 está realizada (ese mismo día) → 25 %
  assert.equal(await rate('10482'), 25)
  // Realizar hoy una del 29 oct no la hace "a tiempo"
  await pedir(app, 'PATCH', '/api/actividades/3', { por: '10482', estado: 'done' })
  assert.equal(await rate('10482'), 25)
  // Una de hoy abierta todavía no cuenta; realizada hoy, sí y a tiempo → 2 de 5
  await pedir(app, 'POST', '/api/actividades', asignar({ fecha: '2026-11-02', puntos: [{ texto: 'Hoy' }] }))
  assert.equal(await rate('10482'), 25)
  const [hecha] = (await pedir(app, 'POST', '/api/actividades', asignar({ fecha: '2026-11-02', puntos: [{ texto: 'Hoy hecha' }] }))).body
  await pedir(app, 'PATCH', `/api/actividades/${hecha.id}`, { por: '10482', estado: 'done' })
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

test('heredar una actividad de días anteriores cuenta desde hoy, no desde su fecha', async (t) => {
  reloj(t, '2026-11-02T18:00:00Z')
  const app = build()
  // Actividad 3: 29 oct, turno A. Se hereda el 2 nov
  assert.equal((await heredar(app, 3, '10230', '10482', '2026-11-02')).body.creada.date, '2026-11-03')
  // Actividad 9: 28 oct, turno B, a otro empleado: siguiente turno (C) del día de hoy
  const otro = (await heredar(app, 9, '10251', '10547', '2026-11-02')).body.creada
  assert.deepEqual([otro.date, otro.shift], ['2026-11-02', 'C'])
  assert.equal((await pedir(app, 'POST', '/api/actividades/8/heredar', { por: '10112', para: '10533' })).code, 400) // falta hoy
})

test('sin porcentaje: el estado manda (Realizada = 100, lo demás 0) y un avance que llegue se ignora', async () => {
  const app = build()
  const { body } = await pedir(app, 'PATCH', '/api/actividades/2', { por: '10482', estado: 'done', avance: 30 })
  assert.deepEqual([body.status, body.pct], ['done', 100])
  assert.equal((await pedir(app, 'PATCH', '/api/actividades/2', { por: '10482', estado: 'progress' })).body.pct, 0)
  await pedir(app, 'PATCH', '/api/actividades/2', { por: '10482', estado: 'done' })
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
  const hecha = (await pedir(app, 'PATCH', '/api/actividades/2', { por: '10482', estado: 'done' })).body
  assert.ok(Date.parse(hecha.doneAt) >= Date.parse(hoy))
  assert.deepEqual([(await inicioDe('10482', hoy)).asignadas, (await inicioDe('10482', hoy)).realizadas], [3, 1])
  // Reabrirla borra el instante; volver a guardarla realizada no lo cambia
  assert.equal((await pedir(app, 'PATCH', '/api/actividades/2', { por: '10482', estado: 'progress' })).body.doneAt, undefined)
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
    ['PATCH', '/api/actividades/1', { por: '10490', estado: 'done', nota: '' }],
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

const propia = (cambios = {}) => ({ por: '10482', textos: ['Purgar línea de retorno'], prioridad: 'diaria', hoy: HOY_REAL, ...cambios })
const enUnaHora = () => new Date(Date.now() + 3_600_000).toISOString()

test('tarea propia diaria: con los datos del empleado, aviso a su encargado y sin avisarse a sí mismo', async () => {
  const app = build()
  const { code, body: [body] } = await pedir(app, 'POST', '/api/actividades/propia', propia())
  assert.equal(code, 201)
  assert.deepEqual([body.to, body.by, body.shift, body.date, body.status, body.prioridad, body.propia], ['10482', '10482', 'A', HOY_REAL, 'pending', 'diaria', true])
  const aviso = (await pedir(app, 'GET', '/api/inicio/10230')).body.notificaciones[0] // Diego, su encargado
  assert.deepEqual([aviso.kind, aviso.who, aviso.actividad], ['propia', 'Jorge Salinas', 'Purgar línea de retorno'])
  // Al actualizarla avisa a su encargado, no a él mismo
  await pedir(app, 'PATCH', `/api/actividades/${body.id}`, { por: '10482', estado: 'done', nota: 'Listo' })
  assert.deepEqual((await pedir(app, 'GET', '/api/inicio/10230')).body.notificaciones.slice(0, 2).map((n) => n.kind).sort(), ['comment', 'done'])
  assert.ok(!(await pedir(app, 'GET', '/api/inicio/10482')).body.notificaciones.some((n) => n.actividad === 'Purgar línea de retorno'))
  // Varias a la vez (Tablero): un solo aviso con cuántas
  const varias = (await pedir(app, 'POST', '/api/actividades/propia', propia({ textos: ['Una', 'Dos', 'Tres'] }))).body
  assert.deepEqual(varias.map((a) => a.text), ['Una', 'Dos', 'Tres'])
  const avisos = (await pedir(app, 'GET', '/api/inicio/10230')).body.notificaciones.filter((n) => n.kind === 'propia')
  assert.deepEqual([avisos.length, avisos[0].count, avisos[0].actividad], [2, 3, 'Una'])
})

test('tarea propia: solo técnico / Ing. Jr y con datos válidos', async () => {
  const app = build()
  const codigo = async (cambios) => (await pedir(app, 'POST', '/api/actividades/propia', propia(cambios))).code
  assert.equal(await codigo({ por: '10230' }), 403) // Ing. Full
  assert.equal(await codigo({ por: '10490' }), 201) // Ing. Jr
  assert.equal(await codigo({ textos: ['  '] }), 400)
  assert.equal(await codigo({ textos: [] }), 400)
  assert.equal(await codigo({ prioridad: 'normal' }), 400)
  assert.equal(await codigo({ hoy: '2030-01-01' }), 400)
  assert.equal(await codigo({ prioridad: 'urgente' }), 400) // sin cierre de turno
  assert.equal(await codigo({ prioridad: 'urgente', cierre: new Date(Date.now() - 60_000).toISOString() }), 400) // ya pasó
  assert.equal(await codigo({ prioridad: 'urgente', cierre: new Date(Date.now() + 2 * 86_400_000).toISOString() }), 400)
})

test('urgente: va primero, no se hereda y al cerrar el turno queda fija', async () => {
  const app = build()
  const [urgente] = (await pedir(app, 'POST', '/api/actividades/propia', propia({ prioridad: 'urgente', cierre: enUnaHora() }))).body
  const lista = async () => (await pedir(app, 'GET', '/api/actividades/10482')).body
  assert.equal((await lista())[0].id, urgente.id)
  assert.equal((await pedir(app, 'POST', `/api/actividades/${urgente.id}/heredar`, { por: '10230', para: '10482', hoy: HOY_REAL, motivo: 'x' })).code, 409)
  // Una urgente terminada antes del cierre queda realizada
  const [hecha] = (await pedir(app, 'POST', '/api/actividades/propia', propia({ prioridad: 'urgente', cierre: enUnaHora() }))).body
  await pedir(app, 'PATCH', `/api/actividades/${hecha.id}`, { por: '10482', estado: 'done' })

  mock.timers.enable({ apis: ['Date'], now: Date.now() + 2 * 3_600_000 }) // dos horas después: el turno ya cerró
  try {
    const cerrada = (await lista()).find((a) => a.id === urgente.id)
    assert.deepEqual([cerrada.status, cerrada.cerrada], ['incomplete', true])
    assert.equal((await lista()).find((a) => a.id === hecha.id).status, 'done')
    assert.equal((await pedir(app, 'PATCH', `/api/actividades/${urgente.id}`, { por: '10482', estado: 'done' })).code, 409)
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
  const { body: [body] } = await pedir(app, 'POST', '/api/actividades/propia', propia({ hoy: ayer }))
  await pedir(app, 'GET', `/api/inicio/10482?hoy=${HOY_REAL}`)
  const deEsta = async (no) => (await pedir(app, 'GET', `/api/inicio/${no}`)).body.notificaciones.filter((n) => n.kind === 'overdue' && n.actividad === body.text)
  assert.equal((await deEsta('10482')).length, 1)
  assert.equal((await deEsta('10230')).length, 1)
})

test('asignar urgente: el encargado la marca aparte, con el cierre del turno elegido; no se hereda', async () => {
  const app = build()
  const { code, body } = await pedir(app, 'POST', '/api/actividades', asignar({ prioridad: 'urgente', cierre: enUnaHora(), puntos: [{ texto: 'Fuga en LC245-02' }] }))
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
    await pedir(app, 'POST', '/api/actividades/propia', propia({ prioridad: 'urgente', hoy: '2026-11-03', cierre: enUnaHora() }))
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

// ── Herencia con validación ───────────────────────────────────────────────────────────────────────────────
const HOY = '2026-11-03'
// Diego asigna a Jorge una actividad pendiente de hoy en ese turno; devuelve su id
const pendiente = async (app, turno = 'A', cambios = {}) =>
  (await pedir(app, 'POST', '/api/actividades', asignar({ fecha: HOY, turno, puntos: [{ texto: `Tarea ${turno}` }], ...cambios }))).body[0].id
const responder = (app, id, por, accion, extra = {}) =>
  pedir(app, 'POST', `/api/herencias/${id}/responder`, { por, accion, hoy: HOY, ...extra })
const bandeja = (app, no) => pedir(app, 'GET', `/api/herencias/${no}?hoy=${HOY}`).then((r) => r.body)

test('herencia: la valida el encargado de quien recibe; rechazar pide motivo; aceptar la pasa', async (t) => {
  reloj(t, '2026-11-03T15:00:00Z')
  const app = build()
  // Laura propone la 3 de Jorge (turno A) a Luis (turno B); Luis reporta a Sofía, que valida
  const p = await heredar(app, 3, '10001', '10511', HOY)
  assert.deepEqual([p.code, p.body.estado, p.body.valida, p.body.validaName, p.body.creada], [201, 'pendiente', '10251', 'Sofía Navarro', undefined])
  assert.equal((await heredar(app, 3, '10001', '10511', HOY)).code, 409) // ya espera validación
  const [h] = (await bandeja(app, '10251')).porValidar
  assert.deepEqual([h.id, h.actividad.text, h.motivo, h.de.name, h.paraPersona.name], [p.body.id, 'Actualizar hoja de WIP de la estación', 'Falta refacción', 'Jorge Salinas', 'Luis Ortega'])
  assert.equal((await pedir(app, 'GET', '/api/inicio/10251')).body.notificaciones[0].kind, 'herencia-pendiente')

  assert.equal((await responder(app, h.id, '10230', 'aceptar')).code, 403) // Diego no es el encargado de Luis
  assert.equal((await responder(app, h.id, '10251', 'rechazar')).code, 400) // sin motivo
  const no = await responder(app, h.id, '10251', 'rechazar', { comentario: 'Luis está en paro de línea' })
  assert.deepEqual([no.code, no.body.estado, no.body.respuesta], [200, 'rechazada', 'Luis está en paro de línea'])
  assert.equal((await pedir(app, 'GET', '/api/inicio/10001')).body.notificaciones[0].kind, 'herencia-rechazada')
  assert.equal((await responder(app, h.id, '10251', 'aceptar')).code, 409) // ya resuelta

  // Rechazada no cuenta en el límite y se puede proponer otra vez
  const otra = (await heredar(app, 3, '10001', '10511', HOY)).body
  assert.equal((await bandeja(app, '10001')).usadas.turnos.A, 1)
  const si = await responder(app, otra.id, '10251', 'aceptar')
  assert.deepEqual([si.body.estado, si.body.creada.to, si.body.creada.shift, si.body.creada.date], ['aceptada', '10511', 'B', HOY])
  assert.ok((await pedir(app, 'GET', '/api/actividades/10511')).body.some((a) => a.id === si.body.creada.id))
  assert.deepEqual((await bandeja(app, '10001')).enviadas.map((x) => x.estado), ['aceptada', 'rechazada'])
})

test('herencia: redirigir a alguien de su equipo, 2 al día; 2 por turno a quien propone; se anula si ya se hizo', async (t) => {
  reloj(t, '2026-11-03T15:00:00Z')
  const app = build()
  for (const [no, email] of [['20001', 'a@empresa.com'], ['20002', 'b@empresa.com']]) {
    await pedir(app, 'POST', '/api/registro', registro({ no, email })) // técnicos del turno B a cargo de Sofía
  }
  const [a1, a2, a3, a4] = [await pendiente(app), await pendiente(app), await pendiente(app), await pendiente(app)]
  const h1 = (await heredar(app, a1, '10001', '10511', HOY)).body
  const h2 = (await heredar(app, a2, '10001', '10511', HOY)).body
  assert.equal((await heredar(app, a3, '10001', '10511', HOY)).body.error, 'Ya heredaste 2 actividades de ese turno hoy.')
  assert.deepEqual((await bandeja(app, '10251')).porValidar[0].opciones.map((o) => o.no).sort(), ['20001', '20002'])

  assert.equal((await responder(app, h1.id, '10251', 'redirigir', { para: '20001' })).code, 400) // sin motivo
  assert.equal((await responder(app, h1.id, '10251', 'redirigir', { para: '10822', comentario: 'x' })).code, 400) // Iván no es de su equipo
  const r1 = (await responder(app, h1.id, '10251', 'redirigir', { para: '20001', comentario: 'Luis va a capacitación' })).body
  assert.deepEqual([r1.estado, r1.redirigidaName, r1.creada.to], ['redirigida', 'Ana Prueba', '20001'])
  await responder(app, h2.id, '10251', 'redirigir', { para: '20002', comentario: 'Reparto de carga' })
  // Carlos (Senior) también puede proponer; Sofía ya no puede redirigir hoy
  const h3 = (await heredar(app, a3, '10112', '10511', HOY)).body
  assert.equal((await responder(app, h3.id, '10251', 'redirigir', { para: '20001', comentario: 'x' })).body.error, 'Ya redirigiste 2 actividades hoy.')
  assert.equal((await bandeja(app, '10251')).usadas.redirecciones, 2)

  // Si el técnico la termina mientras espera, aceptar la anula
  const h4 = (await heredar(app, a4, '10112', '10511', HOY)).body
  await pedir(app, 'PATCH', `/api/actividades/${a4}`, { por: '10482', estado: 'done' })
  assert.equal((await responder(app, h4.id, '10251', 'aceptar')).code, 409)
  assert.equal((await bandeja(app, '10112')).enviadas.find((x) => x.id === h4.id).estado, 'anulada')
})

test('herencia entre departamentos: 2 al día; quién puede recibir según puesto y turno', async (t) => {
  reloj(t, '2026-11-03T15:00:00Z')
  const app = build()
  const [a1, a2, b1] = [await pendiente(app), await pendiente(app), await pendiente(app, 'B')]
  // Receptores de una actividad del turno A de Jorge: él mismo, y técnicos / Ing. Jr del turno B de cualquier departamento
  const receptores = (await conCookie(app, 'GET', `/api/actividades/${a1}/receptores`, await sesionDe(app, '10230'))).json()
  assert.deepEqual(receptores.map((r) => [r.no, r.valida]), [['10482', null], ['10511', 'Sofía Navarro'], ['10822', 'Fernanda Ríos']])
  assert.equal((await conCookie(app, 'GET', `/api/actividades/${a1}/receptores`, await sesionDe(app, '10482'))).statusCode, 403)

  // Iván (SMT, Ing. Jr, turno B) valida Fernanda; Ricardo (Pruebas Funcionales, turno C) valida Elena
  const x1 = (await heredar(app, a1, '10230', '10822', HOY)).body
  assert.deepEqual([x1.estado, x1.cruzada, x1.valida], ['pendiente', true, '10810'])
  await heredar(app, a2, '10230', '10822', HOY)
  assert.equal((await heredar(app, b1, '10230', '10604', HOY)).body.error, 'Ya heredaste 2 actividades a otro departamento hoy.')
  const ok = (await responder(app, x1.id, '10810', 'aceptar')).body
  assert.deepEqual([ok.creada.to, ok.creada.shift], ['10822', 'B'])
})

test('criticidad: por omisión normal; la crítica pasa directo al siguiente turno, sin límite, una vez al día', async (t) => {
  reloj(t, '2026-11-03T15:00:00Z')
  const app = build()
  assert.equal((await pedir(app, 'POST', '/api/actividades', asignar())).body[0].criticidad, 'normal')
  assert.equal((await pedir(app, 'POST', '/api/actividades', asignar({ criticidad: 'urgentisima' }))).code, 400)
  // Diego ya usó sus 2 herencias del turno A de hoy
  await heredar(app, await pendiente(app), '10230', '10482', HOY)
  await heredar(app, await pendiente(app), '10230', '10482', HOY)
  const critica = await pendiente(app, 'A', { criticidad: 'critica' })
  const h = (await heredar(app, critica, '10230', '10511', HOY)).body // Luis es de Sofía, pero la crítica no espera validación
  assert.deepEqual([h.estado, h.critica, h.creada.criticidad, h.creada.pasadaEl, h.creada.shift], ['aceptada', true, 'critica', HOY, 'B'])
  // Ya pasó de turno hoy: Sofía no puede pasarla de nuevo (B → C) hasta mañana
  const otra = await heredar(app, h.creada.id, '10251', '10547', HOY)
  assert.deepEqual([otra.code, otra.body.error], [409, 'Una actividad crítica pasa de turno una sola vez al día.'])
  mock.timers.tick(86_400_000)
  const manana = (await heredar(app, h.creada.id, '10251', '10547', '2026-11-04')).body
  assert.deepEqual([manana.estado, manana.creada.to, manana.creada.shift], ['aceptada', '10547', 'C'])
})

// ── Departamentos del gerente: crear y cargar plantilla ─────────────────────────────────────────────────────
const fila = (cambios = {}) => ({ no: '30001', name: 'Rosa Vega', email: 'rosa.vega@empresa.com', role: 'tec', shift: 'A', area: '', boss: '10230', ...cambios })
const plantilla = (app, clave, filas, extra = {}) => pedir(app, 'POST', `/api/departamentos/${clave}/plantilla`, { por: '10001', filas, ...extra })

test('crear departamento: solo un gerente, nombre único; lo dirige quien lo crea', async () => {
  const app = build()
  const crear = (por, nombre) => pedir(app, 'POST', '/api/departamentos', { por, nombre })
  assert.equal((await crear('10112', 'Calidad')).code, 403) // un Senior no
  const d = await crear('10001', '  Calidad   de Proceso ')
  assert.deepEqual([d.code, d.body.clave, d.body.nombre], [201, 'calidad-de-proce', 'Calidad de Proceso'])
  assert.equal((await crear('10700', 'calidad de proceso')).code, 409)
  assert.ok((await pedir(app, 'GET', '/api/deptos')).body.some((x) => x.clave === 'calidad-de-proce'))
  // Laura puede ser encargada en Registro del departamento nuevo
  const laura = (await pedir(app, 'GET', '/api/encargados')).body.find((e) => e.no === '10001')
  assert.deepEqual(laura.depts, ['lc', 'calidad-de-proce'])
  const reg = { name: 'Nuevo Técnico', no: '20010', email: 'nuevo@empresa.com', role: 'tec', dept: 'calidad-de-proce', shift: 'A', boss: '10001', password: 'Nueva#Clave2026' }
  assert.equal((await pedir(app, 'POST', '/api/registro', reg)).code, 201)
  assert.equal((await pedir(app, 'POST', '/api/registro', { ...reg, no: '20011', email: 'x@empresa.com', dept: 'no-existe' })).code, 400)
})

test('plantilla: revisa todo junto, no guarda nada si hay un error; crea y actualiza', async () => {
  const app = build()
  // Revisión: una fila nueva válida, otra cuyo encargado viene en el mismo archivo
  const nuevas = [fila(), fila({ no: '30002', name: 'Iker Soto', email: 'iker.soto@empresa.com', role: 'jr', boss: '30003' }),
    fila({ no: '30003', name: 'Marta Gil', email: 'marta.gil@empresa.com', role: 'full', boss: '10001', area: 'Línea 9' })]
  const rev = (await plantilla(app, 'lc', nuevas, { soloRevisar: true })).body
  assert.deepEqual([rev.conError, rev.filas.map((f) => f.accion)], [0, ['crear', 'crear', 'crear']])
  assert.equal((await pedir(app, 'GET', '/api/encargados')).body.some((e) => e.no === '30003'), false) // no guardó

  // Errores por fila: nada se guarda
  const malas = [
    fila({ no: '10604' }), // de otro departamento
    fila({ no: '30010', email: 'jorge.salinas@empresa.com' }), // correo de otra persona
    fila({ no: '30011', email: 'a@empresa.com', boss: '10482' }), // un técnico no es encargado
    fila({ no: '30012', email: 'b@empresa.com', role: 'sr', boss: '10230' }), // Ing. Full no puede tener a un Senior
    fila({ no: '30013', email: 'c@empresa.com', boss: '10700' }), // encargado de otro departamento
    fila({ no: '10001', email: 'd@empresa.com' }), // el gerente mismo
    fila({ no: '30014', email: 'e@empresa.com' }), fila({ no: '30014', email: 'f@empresa.com' }), // repetido
  ]
  const r = await plantilla(app, 'lc', malas)
  assert.equal(r.code, 400)
  assert.deepEqual(r.body.filas.map((f) => f.error), [
    'Ese número es de otro departamento.', 'Ese correo ya lo usa otra persona.',
    'El encargado debe ser Ing. Full, Senior o Gerente, de mayor puesto que la persona.',
    'El encargado debe ser Ing. Full, Senior o Gerente, de mayor puesto que la persona.',
    'El encargado no existe en este departamento.', 'Tú no vas en la plantilla: ya diriges el departamento.',
    null, 'Número repetido en el archivo.',
  ])
  assert.equal((await plantilla(app, 'pf', [fila()])).code, 403) // Laura no dirige Pruebas Funcionales
  assert.equal((await pedir(app, 'POST', '/api/departamentos/lc/plantilla', { por: '10230', filas: [fila()] })).code, 403) // Ing. Full

  // Guardar: crea las nuevas (sin contraseña: la crean con "¿Olvidaste tu contraseña?") y actualiza a Jorge
  const ok = (await plantilla(app, 'lc', [...nuevas, fila({ no: '10482', name: 'Jorge Salinas', email: 'jorge.salinas@empresa.com', shift: 'B' })])).body
  assert.deepEqual([ok.creados, ok.actualizados], [3, 1])
  // Las nuevas reciben una contraseña temporal (se muestra una vez); con ella entran y vinculan su app
  assert.deepEqual(ok.temporales.map((x) => x.no), nuevas.map((f) => f.no))
  const rosa = ok.temporales.find((x) => x.no === '30001')
  assert.equal((await login({ usuario: '30001', password: 'null' }, app)).statusCode, 401)
  assert.match((await login({ usuario: '30001', password: rosa.temporal }, app)).json().secreto, /^[A-Z2-7]{32}$/)
  const plantel = (await conCookie(app, 'GET', '/api/departamentos', await sesionDe(app, '10001'))).json()
  assert.equal(plantel.find((e) => e.no === '30002').area, 'Línea 9') // heredó el área de su encargada
  assert.equal((await pedir(app, 'GET', '/api/perfil/10482')).body.shift, 'B')
  assert.ok((await pedir(app, 'GET', '/api/equipo/10001')).body.some((e) => e.no === '30002'))
  // Bajar de puesto a alguien que tiene gente a su cargo crearía un ciclo: no se permite
  const ciclo = await plantilla(app, 'lc', [fila({ no: '10230', name: 'Diego Herrera', email: 'diego.herrera@empresa.com', role: 'tec', boss: '10112' })])
  assert.equal(ciclo.body.filas[0].error, 'El encargado debe ser Ing. Full, Senior o Gerente, de mayor puesto que la persona.')
})

// ── Super administrador ───────────────────────────────────────────────────────────────────────────────────
// Cuenta ficticia: las reales van en la variable de entorno SUPERADMINS, nunca en el repositorio
const SA = { name: 'Admin Prueba', email: 'admin@empresa.com', password: 'Admin#Prueba2026' }
async function conSA() {
  const app = build({ superadmins: [SA] })
  const sa = cookieDe(await entrar(SA.email, SA.password, app))
  const adm = (method, url, payload) => conCookie(app, method, url, sa, payload).then((r) => ({ code: r.statusCode, body: r.json() }))
  const confirmar = (password = SA.password) => adm('POST', '/api/admin/confirmar', { por: '90001', password })
  return { app, sa, adm, confirmar }
}

test('contraseñas: se guardan con hash, nunca tal cual', async () => {
  assert.ok(!readFileSync(new URL('./usuarios.json', import.meta.url), 'utf8').includes('demo1234'))
  assert.equal((await login({ usuario: '10482', password: 'demo1234' })).statusCode, 200)
  assert.equal((await login({ usuario: '10482', password: 'Demo1234' })).statusCode, 401)
  const { adm } = await conSA()
  const jorge = (await adm('GET', '/api/admin/usuarios')).body.find((u) => u.no === '10482')
  assert.equal(['password', 'totp', 'totpPaso'].some((k) => k in jorge), false)
})

test('super administrador: solo él entra a /api/admin y los cambios piden confirmar su contraseña', async () => {
  const { app, sa, adm, confirmar } = await conSA()
  assert.equal((await conCookie(app, 'GET', '/api/admin/usuarios', await sesionDe(app, '10001'))).statusCode, 403) // ni el gerente
  assert.equal((await login({ usuario: SA.email, password: SA.password, tipo: 'operativo' }, app)).statusCode, 403) // entra por Gerencia
  const lista = (await adm('GET', '/api/admin/usuarios')).body
  assert.deepEqual([lista.length, lista.at(-1).role, lista.find((u) => u.no === '10482').bossName], [16, 'sa', 'Diego Herrera'])

  const editar = (no, cambios) => adm('PATCH', `/api/admin/usuarios/${no}`, { por: '90001', ...cambios })
  assert.deepEqual([(await editar('10482', { shift: 'B' })).code, (await editar('10482', { shift: 'B' })).body.confirmar], [403, true])
  assert.equal((await confirmar('mala')).body.error, 'La contraseña no es correcta.')
  assert.equal((await confirmar()).code, 200)
  assert.equal((await editar('10482', { shift: 'B' })).body.shift, 'B')
  assert.equal((await editar('10482', { role: 'full' })).body.error, 'Su encargado debe ser de mayor puesto: cambia primero a su encargado.')
  assert.equal((await editar('10230', { role: 'jr' })).body.error, 'Tiene a su cargo personas de igual o mayor puesto: cámbialas primero.')
  assert.equal((await editar('90001', { shift: 'B' })).code, 403) // las cuentas SA se manejan en el servidor
  // Respaldo: toda la base menos las sesiones, y queda en los registros
  const copia = (await adm('POST', '/api/admin/respaldo', { por: '90001' })).body
  assert.equal(copia.tablas.usuarios.length, 16)
  assert.ok(copia.tablas.actividades.length && !('sesiones' in copia.tablas))
  assert.ok((await adm('GET', '/api/admin/registros')).body.some((r) => r.evento === 'admin-respaldo'))
  assert.equal((await pedir(app, 'POST', '/api/admin/respaldo', { por: '10001' })).code, 403) // solo super administradores

  // Quitar el acceso: cierra su sesión y ya no puede entrar
  const jorge = await sesionDe(app, '10482')
  assert.equal((await editar('10482', { activo: false })).body.activo, false)
  assert.equal((await conCookie(app, 'GET', '/api/sesion', jorge)).statusCode, 401)
  assert.equal((await login({ usuario: '10482', password: 'demo1234' }, app)).json().error, 'Tu cuenta no tiene acceso al sistema. Habla con un administrador.')
  await editar('10482', { activo: true })
  assert.equal((await login({ usuario: '10482', password: 'demo1234' }, app)).statusCode, 200)

  // 5 confirmaciones fallidas cierran la sesión del super administrador
  for (let i = 0; i < 4; i++) await confirmar('mala')
  assert.equal((await confirmar('mala')).code, 401)
  assert.equal((await conCookie(app, 'GET', '/api/sesion', sa)).statusCode, 401)
})

test('restablecer contraseña: temporal de una vez que obliga a cambiarla; reiniciar el MFA', async () => {
  const { app, adm, confirmar } = await conSA()
  await confirmar()
  const { temporal } = (await adm('POST', '/api/admin/usuarios/10482/password', { por: '90001' })).body
  assert.match(temporal, /^Tmp-[A-Z2-7]{8}!\d{2}$/)
  assert.equal((await login({ usuario: '10482', password: 'demo1234' }, app)).statusCode, 401)
  const r = await login({ usuario: '10482', password: temporal }, app)
  assert.equal(r.json().debeCambiar, true)
  const cookie = cookieDe(r)
  assert.equal((await conCookie(app, 'GET', '/api/inicio/10482', cookie)).json().debeCambiar, true) // nada más hasta cambiarla
  assert.equal((await conCookie(app, 'POST', '/api/perfil/10482/password', cookie, { actual: temporal, nueva: CLAVE })).statusCode, 200)
  assert.equal((await conCookie(app, 'GET', '/api/inicio/10482', cookie)).statusCode, 200)
  assert.equal((await conCookie(app, 'GET', '/api/sesion', cookie)).json().debeCambiar, undefined)

  // MFA: una cuenta registrada lo vincula; el super administrador lo reinicia y el siguiente login lo pide de nuevo
  await app.inject({ method: 'POST', url: '/api/registro', payload: registro() })
  await entrar('20001', CLAVE, app)
  assert.equal((await adm('GET', '/api/admin/usuarios')).body.find((u) => u.no === '20001').mfa, true)
  assert.equal((await adm('POST', '/api/admin/usuarios/20001/mfa', { por: '90001' })).body.mfa, false)
  assert.match((await login({ usuario: '20001', password: CLAVE }, app)).json().secreto, /^[A-Z2-7]{32}$/)
})

test('registros: accesos con IP y navegador, fallidos, cambios del administrador; filtros y borrar antiguos', async () => {
  const { app, adm, confirmar } = await conSA()
  await app.inject({ method: 'POST', url: '/api/login', payload: { usuario: 'jorge.salinas', password: 'mala' }, headers: { 'user-agent': 'Prueba/1.0' } })
  await login({ usuario: '10482', password: 'demo1234' }, app)
  const todos = (await adm('GET', '/api/admin/registros')).body
  const fallido = todos.find((r) => r.evento === 'login-fallido')
  assert.deepEqual([fallido.no, fallido.name, fallido.usuario, fallido.ip, fallido.agente, fallido.ok], ['10482', 'Jorge Salinas', 'jorge.salinas', '127.0.0.1', 'Prueba/1.0', false])
  assert.equal(todos[0].evento, 'login') // del más nuevo al más viejo
  assert.ok(todos.some((r) => r.evento === 'login' && r.no === '90001' && r.detalle === 'vinculó su app autenticadora'))
  assert.ok((await adm('GET', '/api/admin/registros?q=jorge')).body.every((r) => r.no === '10482'))
  assert.equal((await adm('GET', '/api/admin/registros?evento=login-fallido')).body.length, 1)
  await confirmar()
  await adm('PATCH', '/api/admin/usuarios/10490', { por: '90001', shift: 'C' })
  const cambio = (await adm('GET', '/api/admin/registros?evento=admin-usuario')).body[0]
  assert.deepEqual([cambio.name, cambio.porName, cambio.detalle], ['María López', 'Admin Prueba', 'shift=C'])
  // Borrar antiguos (todo lo de antes de mañana): queda solo el registro del borrado
  const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  assert.ok((await adm('POST', '/api/admin/registros/purgar', { por: '90001', antes: manana })).body.borrados >= 5)
  assert.deepEqual((await adm('GET', '/api/admin/registros')).body.map((r) => r.evento), ['registros-purgados'])
})

test('registros detrás del proxy: la IP que agregó el proxy, no la que inventa quien llama', async () => {
  const app = build({ trustProxy: true, superadmins: [SA] })
  await app.inject({ method: 'POST', url: '/api/login', payload: { usuario: 'x', password: 'y' }, headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.7' } })
  const sa = cookieDe(await entrar(SA.email, SA.password, app))
  const [fallido] = (await conCookie(app, 'GET', '/api/admin/registros?evento=login-fallido', sa)).json()
  assert.equal(fallido.ip, '203.0.113.7')
})

// ── Tablero: mover entre columnas de criticidad, fijar y eliminar ─────────────────────────────────────────
test('tablero: el encargado mueve entre criticidades y a Urgente, fija y elimina; nadie más', async () => {
  const app = build()
  // Se crea en el panel Por clasificar (criticidad 'nueva') y de ahí se mueve
  const [a] = (await pedir(app, 'POST', '/api/actividades', asignar({ fecha: HOY_REAL, criticidad: 'nueva', puntos: [{ texto: 'Ajustar sensor' }] }))).body
  assert.equal(a.criticidad, 'nueva')
  const mover = (cambios, por = '10230') => pedir(app, 'PATCH', `/api/actividades/${a.id}/tablero`, { por, ...cambios })
  assert.equal((await mover({ fijada: true }, '10482')).code, 403) // el técnico no fija (mover lo pide: ver solicitudes)
  assert.equal((await mover({ columna: 'alta' }, '10251')).code, 403) // Sofía no es su encargada
  assert.equal((await mover({ columna: 'alta' })).body.criticidad, 'alta')
  assert.equal((await mover({ columna: 'urgente' })).code, 400) // sin cierre de turno
  const u = (await mover({ columna: 'urgente', cierre: enUnaHora() })).body
  assert.deepEqual([u.prioridad, u.criticidad, typeof u.cierreTurno], ['urgente', undefined, 'string'])
  assert.equal((await pedir(app, 'GET', '/api/inicio/10482')).body.notificaciones[0].kind, 'urgente')
  const n = (await mover({ columna: 'critica' })).body
  assert.deepEqual([n.prioridad, n.cierreTurno, n.criticidad], [undefined, undefined, 'critica'])
  assert.equal((await mover({ fijada: true })).body.fijada, true)
  // Eliminar: desaparece de sus listas y sus avisos
  assert.equal((await pedir(app, 'DELETE', `/api/actividades/${a.id}`, { por: '10482' })).code, 403)
  assert.equal((await pedir(app, 'DELETE', `/api/actividades/${a.id}`, { por: '10230' })).code, 200)
  assert.ok(!(await pedir(app, 'GET', '/api/actividades/10482')).body.some((x) => x.id === a.id))
  assert.ok(!(await pedir(app, 'GET', '/api/inicio/10482')).body.notificaciones.some((x) => x.kind === 'urgente'))
  assert.equal((await mover({ columna: 'alta' })).code, 404)
})

test('tablero del técnico: pide mover sus tarjetas y su encargado aprueba o rechaza', async () => {
  const app = build()
  const [a] = (await pedir(app, 'POST', '/api/actividades', asignar({ fecha: HOY_REAL, criticidad: 'nueva', puntos: [{ texto: 'Calibrar' }] }))).body
  const pedirMover = (columna, extra = {}) => pedir(app, 'PATCH', `/api/actividades/${a.id}/tablero`, { por: '10482', columna, ...extra })
  const r = await pedirMover('alta')
  assert.deepEqual([r.code, r.body.criticidad, r.body.solicitud.columna], [202, 'nueva', 'alta']) // no se mueve todavía
  const aviso = (await pedir(app, 'GET', '/api/inicio/10230')).body.notificaciones[0]
  assert.deepEqual([aviso.kind, aviso.columna, aviso.actividad], ['solicitud', 'alta', 'Calibrar'])
  const responder = (aprobar, por = '10230') => pedir(app, 'POST', `/api/actividades/${a.id}/solicitud`, { por, aprobar })
  assert.equal((await responder(true, '10482')).code, 403) // no se aprueba a sí mismo
  assert.equal((await responder(true, '10251')).code, 403) // ni otra encargada
  const ok = (await responder(true)).body
  assert.deepEqual([ok.criticidad, ok.solicitud], ['alta', undefined])
  assert.equal((await pedir(app, 'GET', '/api/inicio/10482')).body.notificaciones[0].kind, 'solicitud-ok')
  assert.equal((await responder(true)).code, 404) // ya no hay solicitud
  // Rechazada: se queda donde estaba
  await pedirMover('urgente', { cierre: enUnaHora() })
  const no = (await responder(false)).body
  assert.deepEqual([no.criticidad, no.prioridad, no.solicitud], ['alta', undefined, undefined])
  assert.equal((await pedir(app, 'GET', '/api/inicio/10482')).body.notificaciones[0].kind, 'solicitud-no')
  // Si el encargado la mueve a mano, la solicitud queda resuelta
  await pedirMover('simple')
  const m = (await pedir(app, 'PATCH', `/api/actividades/${a.id}/tablero`, { por: '10230', columna: 'critica' })).body
  assert.deepEqual([m.criticidad, m.solicitud], ['critica', undefined])
  // Agrega a Por clasificar con su tarea propia; la plantilla del departamento ya no es para él
  const [p] = (await pedir(app, 'POST', '/api/actividades/propia', { por: '10482', textos: ['Nueva idea'], prioridad: 'diaria', criticidad: 'nueva', hoy: HOY_REAL })).body
  assert.equal(p.criticidad, 'nueva')
})

test('auditoría: los números de actividad no se reutilizan al eliminar; equipo trae quién la creó; login con límite', async () => {
  const app = build()
  const [a] = (await pedir(app, 'POST', '/api/actividades', asignar({ puntos: [{ texto: 'Primera' }] }))).body
  await pedir(app, 'DELETE', `/api/actividades/${a.id}`, { por: '10230' })
  const [b] = (await pedir(app, 'POST', '/api/actividades', asignar({ puntos: [{ texto: 'Segunda' }] }))).body
  assert.equal(b.id, a.id + 1)
  const jorge = (await pedir(app, 'GET', '/api/equipo/10001')).body.find((e) => e.no === '10482')
  assert.equal(jorge.actividades.find((x) => x.id === b.id).byName, 'Diego Herrera')
  for (let i = 0; i < 10; i++) await login({ usuario: '10490', password: 'mala' }, app)
  const r = await login({ usuario: '10490', password: 'demo1234' }, app) // ya bloqueado aunque ahora acierte
  assert.deepEqual([r.statusCode, r.json().error], [429, 'Demasiados intentos. Espera 15 minutos.'])
  assert.equal((await login({ usuario: '10482', password: 'demo1234' }, app)).statusCode, 200) // otro usuario sigue entrando
})

// ── Recurrentes, edición y tareas guardadas ─────────────────────────────────────────────────────────────
test('siguiente fecha de una recurrente: día hábil, +7 días y mismo día del mes (o el último)', () => {
  assert.equal(siguienteFecha('2026-10-30', 'diaria'), '2026-11-02') // viernes → lunes
  assert.equal(siguienteFecha('2026-11-02', 'diaria'), '2026-11-03')
  assert.equal(siguienteFecha('2026-11-02', 'semanal'), '2026-11-09')
  assert.equal(siguienteFecha('2026-01-31', 'mensual', 31), '2026-02-28')
  assert.equal(siguienteFecha('2026-02-28', 'mensual', 31), '2026-03-31') // vuelve al 31
  assert.equal(siguienteFecha('2026-12-15', 'mensual', 15), '2027-01-15')
  assert.equal(siguienteFecha('2026-03-20', 'mensual'), '2026-04-20') // sin diaMes: el de la fecha
})

test('recurrente: al llegar su periodo se crea una copia nueva y la recurrencia pasa a ella', async () => {
  const app = build()
  const hace = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
  const [a] = (await pedir(app, 'POST', '/api/actividades', asignar({ fecha: hace(14), recurrencia: 'semanal', puntos: [{ texto: 'Inspección semanal' }] }))).body
  assert.equal(a.recurrencia, 'semanal')
  const copias = async () => (await pedir(app, 'GET', '/api/actividades/10482')).body.filter((x) => x.text === 'Inspección semanal')
  assert.equal((await copias()).length, 1) // todavía no se consulta Inicio con la fecha de hoy
  await pedir(app, 'GET', `/api/inicio/10482?hoy=${HOY_REAL}`)
  await pedir(app, 'GET', `/api/inicio/10230?hoy=${HOY_REAL}`) // otra consulta el mismo día no duplica
  const [nueva, vieja] = await copias()
  assert.deepEqual([nueva.date, nueva.status, nueva.recurrencia, nueva.criticidad], [HOY_REAL, 'pending', 'semanal', 'normal']) // salta la semana sin entrar
  assert.deepEqual([vieja.id, vieja.recurrencia], [a.id, undefined])
  // Al moverla a Urgente deja de repetirse (es para un solo turno)
  const u = (await pedir(app, 'PATCH', `/api/actividades/${nueva.id}/tablero`, { por: '10230', columna: 'urgente', cierre: enUnaHora() })).body
  assert.deepEqual([u.prioridad, u.recurrencia], ['urgente', undefined])
  await pedir(app, 'PATCH', `/api/actividades/${nueva.id}/editar`, { por: '10230', recurrencia: 'semanal' }) // 400: urgente
  await pedir(app, 'PATCH', `/api/actividades/${nueva.id}/tablero`, { por: '10230', columna: 'normal' })
  assert.equal((await pedir(app, 'PATCH', `/api/actividades/${nueva.id}/editar`, { por: '10230', recurrencia: 'semanal' })).body.recurrencia, 'semanal')
  // Se deja de repetir desde Editar
  assert.equal((await pedir(app, 'PATCH', `/api/actividades/${nueva.id}/editar`, { por: '10230', recurrencia: 'no' })).body.recurrencia, undefined)
})

test('editar: el encargado todo, el técnico solo las suyas (texto, fecha y recurrencia); se avisa al otro', async () => {
  const app = build()
  const [a] = (await pedir(app, 'POST', '/api/actividades', asignar({ fecha: HOY_REAL, puntos: [{ texto: 'Revisar bomba' }] }))).body
  const editar = (id, por, cambios) => pedir(app, 'PATCH', `/api/actividades/${id}/editar`, { por, ...cambios })
  assert.equal((await editar(a.id, '10482', { texto: 'Otra cosa' })).code, 403) // se la asignaron: no la edita
  assert.equal((await editar(a.id, '10251', { texto: 'Otra cosa' })).code, 403) // otra encargada
  const e = (await editar(a.id, '10230', { texto: ' Revisar bomba P-12 ', comentario: 'Con el manual', turno: 'B', recurrencia: 'diaria' })).body
  assert.deepEqual([e.text, e.mgr, e.shift, e.recurrencia], ['Revisar bomba P-12', 'Con el manual', 'B', 'diaria'])
  assert.equal((await pedir(app, 'GET', '/api/inicio/10482')).body.notificaciones[0].kind, 'editada')
  // Tarea propia del técnico
  const [p] = (await pedir(app, 'POST', '/api/actividades/propia', { por: '10482', textos: ['Mía'], prioridad: 'diaria', hoy: HOY_REAL, recurrencia: 'mensual' })).body
  assert.deepEqual([p.recurrencia, p.diaMes], ['mensual', Number(HOY_REAL.slice(8))])
  assert.equal((await editar(p.id, '10482', { comentario: 'x' })).code, 403)
  assert.equal((await editar(p.id, '10482', { texto: 'Mía, corregida', recurrencia: 'no' })).body.recurrencia, undefined)
  assert.equal((await pedir(app, 'GET', '/api/inicio/10230')).body.notificaciones[0].kind, 'editada') // a su encargado
  // Una urgente no se repite
  const [u] = (await pedir(app, 'POST', '/api/actividades/propia', { por: '10482', textos: ['Ya'], prioridad: 'urgente', hoy: HOY_REAL, cierre: enUnaHora() })).body
  assert.equal((await editar(u.id, '10482', { recurrencia: 'diaria' })).code, 400)
})

test('tareas guardadas: personales, mismo texto actualiza, solo el dueño elimina', async () => {
  const app = build()
  const guardar = (por, cambios) => pedir(app, 'POST', '/api/guardadas', { por, texto: 'Limpiar filtros', criticidad: 'normal', ...cambios })
  const g = (await guardar('10230')).body
  assert.equal(g.no, '10230')
  await guardar('10230', { texto: 'Auditoría 5S', criticidad: 'critica', recurrencia: 'semanal' })
  assert.equal((await guardar('10230', { texto: 'limpiar filtros', criticidad: 'alta' })).body.id, g.id) // mismo texto: se actualiza
  const mias = (await pedir(app, 'GET', '/api/guardadas/10230')).body
  assert.deepEqual(mias.map((x) => [x.texto, x.criticidad]), [['Auditoría 5S', 'critica'], ['limpiar filtros', 'alta']])
  assert.deepEqual((await pedir(app, 'GET', '/api/guardadas/10482')).body, []) // cada quien las suyas
  assert.equal((await conCookie(app, 'GET', '/api/guardadas/10230', await sesionDe(app, '10482'))).statusCode, 403) // ni las de otro
  assert.equal((await guardar('10230', { criticidad: 'urgente' })).code, 400)
  assert.equal((await pedir(app, 'DELETE', `/api/guardadas/${g.id}`, { por: '10482' })).code, 404)
  assert.equal((await pedir(app, 'DELETE', `/api/guardadas/${g.id}`, { por: '10230' })).code, 200)
  assert.equal((await pedir(app, 'GET', '/api/guardadas/10230')).body.length, 1)
})

test('borrar historial de notificaciones: solo las propias, y los avisos automáticos no vuelven', async () => {
  const app = build()
  const mias = async (no) => (await pedir(app, 'GET', `/api/inicio/${no}?hoy=${HOY_REAL}`)).body.notificaciones.length
  const deDiego = await mias('10230')
  assert.ok((await mias('10482')) > 0)
  assert.ok((await pedir(app, 'DELETE', '/api/notificaciones/10482')).body.borradas > 0)
  assert.equal(await mias('10482'), 0) // con hoy: no se vuelven a generar los de atraso ni el de contraseña
  assert.equal(await mias('10230'), deDiego) // las de otros quedan
  assert.equal((await conCookie(app, 'DELETE', '/api/notificaciones/10230', await sesionDe(app, '10482'))).statusCode, 403)
})
