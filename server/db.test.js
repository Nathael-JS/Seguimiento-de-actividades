import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { build } from './app.js'
import { cargar, conectar, guardador, respaldo, restaurar } from './db.js'

// Las pruebas usan los datos de los mockups (server/datos/pruebas), no el inicio limpio
process.env.DATOS_SEMILLA = 'pruebas'

// Contra un PostgreSQL de pruebas (BORRA sus tablas): TEST_DATABASE_URL=postgresql://… npm test
const url = process.env.TEST_DATABASE_URL

// Arranca como server/index.js: carga lo guardado (o los datos de prueba) y guarda después de cada petición
async function arrancar(pool) {
  const { datos: estado, instancia } = await cargar(pool)
  const db = guardador(pool, instancia, { error: (e) => { if (e?.err) throw e.err } })
  const app = build({ estado, guardar: db.guardar, superadmins: [{ name: 'Admin Prueba', email: 'admin@empresa.com', password: 'Admin#Prueba2026' }] })
  if (estado) db.yaGuardado(estado)
  await db.guardar(app.estado)
  return { app, db }
}

test('PostgreSQL: primera carga con los datos de prueba; lo que cambia sobrevive a un reinicio', { skip: !url && 'sin TEST_DATABASE_URL' }, async () => {
  const pool = await conectar(url)
  try {
    await pool.query('drop table if exists departamentos, usuarios, actividades, notificaciones, herencias, guardadas, sesiones, registros, checador, ids')
    // Una base de una versión anterior (actividades sin las columnas nuevas): conectar las agrega
    await pool.query('create table actividades (id integer primary key, texto text)')
    const limpio = await conectar(url)
    await limpio.end()
    assert.equal((await pool.query("select count(*) from information_schema.columns where table_name = 'actividades' and column_name = 'recurrencia'")).rows[0].count, 1)
    assert.equal((await cargar(pool)).datos, null) // vacía

    const { app } = await arrancar(pool)
    const cuenta = async (t) => Number((await pool.query(`select count(*) from ${t}`)).rows[0].count)
    assert.deepEqual([await cuenta('usuarios'), await cuenta('actividades'), await cuenta('checador')], [16, 14, 933])

    // Cambios: entra Diego (sesión y registro), crea dos actividades y elimina la última
    const login = await app.inject({ method: 'POST', url: '/api/login', payload: { usuario: '10230', password: 'demo1234' } })
    const cookie = login.headers['set-cookie'].split(';')[0]
    const pedir = (method, u, payload) => app.inject({ method, url: u, payload, headers: { cookie } }).then((r) => r.json())
    const [a] = await pedir('POST', '/api/actividades', { por: '10230', para: '10482', fecha: '2026-11-04', turno: 'A', criticidad: 'nueva', puntos: [{ texto: 'Guardada en Postgres' }] })
    const [b] = await pedir('POST', '/api/actividades', { por: '10230', para: '10482', fecha: '2026-11-04', turno: 'A', puntos: [{ texto: 'Se borra' }] })
    await pedir('DELETE', `/api/actividades/${b.id}`, { por: '10230' })
    const fila = (await pool.query('select para, fecha, criticidad, estado from actividades where id = $1', [a.id])).rows[0]
    assert.deepEqual(fila, { para: '10482', fecha: '2026-11-04', criticidad: 'nueva', estado: 'pending' })

    // "Reinicio": otra app con lo cargado de la base
    const { app: otra } = await arrancar(pool)
    const sesion = await otra.inject({ method: 'GET', url: '/api/sesion', headers: { cookie } })
    assert.equal(sesion.json().name, 'Diego Herrera') // la sesión sigue abierta
    const pedir2 = (method, u, payload) => otra.inject({ method, url: u, payload, headers: { cookie } }).then((r) => r.json())
    const jorge = (await pedir2('GET', '/api/equipo/10230')).find((e) => e.no === '10482')
    assert.ok(jorge.actividades.some((x) => x.id === a.id && x.text === 'Guardada en Postgres'))
    assert.ok(!jorge.actividades.some((x) => x.id === b.id))
    // El número de la borrada no se reutiliza tras el reinicio
    const [c] = await pedir2('POST', '/api/actividades', { por: '10230', para: '10482', fecha: '2026-11-04', turno: 'A', puntos: [{ texto: 'Otra' }] })
    assert.equal(c.id, b.id + 1)
    // El super administrador no se duplica al reiniciar
    assert.equal(await cuenta('usuarios'), 16)

    // La instancia anterior (app) ya no es la dueña: no guarda y responde 503 para que el navegador recargue
    const viejo = await app.inject({ method: 'POST', url: '/api/actividades', headers: { cookie }, payload: { por: '10230', para: '10482', fecha: '2026-11-04', turno: 'A', puntos: [{ texto: 'Perdida' }] } })
    assert.equal(viejo.statusCode, 503)
    assert.equal(Number((await pool.query("select count(*) from actividades where texto = 'Perdida'")).rows[0].count), 0)

    // Respaldo y restauración: lo de después del respaldo desaparece; las sesiones no se respaldan
    const copia = JSON.parse(JSON.stringify(respaldo(otra.estado)))
    assert.ok(!('sesiones' in copia.tablas))
    await pedir2('POST', '/api/actividades', { por: '10230', para: '10482', fecha: '2026-11-04', turno: 'A', puntos: [{ texto: 'Después del respaldo' }] })
    await restaurar(pool, copia)
    assert.equal((await otra.inject({ method: 'POST', url: '/api/logout', headers: { cookie } })).statusCode, 503) // tomó la base
    const { app: tercera } = await arrancar(pool)
    const textos = tercera.estado.actividades.map((x) => x.text)
    assert.ok(textos.includes('Otra') && !textos.includes('Después del respaldo'))
    assert.equal(tercera.estado.sesiones.size, 0)
    const [d] = (await tercera.inject({ method: 'POST', url: '/api/login', payload: { usuario: '10230', password: 'demo1234' } }).then(async (l) =>
      tercera.inject({ method: 'POST', url: '/api/actividades', headers: { cookie: l.headers['set-cookie'].split(';')[0] }, payload: { por: '10230', para: '10482', fecha: '2026-11-04', turno: 'A', puntos: [{ texto: 'Tras restaurar' }] } }))).json()
    assert.equal(d.id, c.id + 1) // el contador de números también se restauró
  } finally {
    await pool.end()
  }
})

test('vaciar: deja la base desde 0 (sin usuarios ni departamentos) y conserva a los super administradores', { skip: !url && 'sin TEST_DATABASE_URL' }, async () => {
  const pool = await conectar(url)
  try {
    const { app } = await arrancar(pool) // con datos y con el super administrador de prueba
    await app.inject({ method: 'POST', url: '/api/login', payload: { usuario: '10230', password: 'demo1234' } })
    execFileSync('node', ['server/vaciar.js', 'VACIAR'], { env: { ...process.env, DATABASE_URL: url } })
    const { datos } = await cargar(pool)
    assert.deepEqual(datos.usuarios.map((u) => [u.no, u.role]), [['90001', 'sa']]) // solo los super administradores
    assert.deepEqual([datos.actividades.length, datos.notificaciones.length, datos.checador.length, datos.departamentos.length], [0, 0, 0, 0])
    assert.equal(datos.sesiones.size, 0)
  } finally {
    await pool.end()
  }
})
