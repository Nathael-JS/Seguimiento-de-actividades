import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from './app.js'
import { cargar, conectar, guardador } from './db.js'

// Contra un PostgreSQL de pruebas (BORRA sus tablas): TEST_DATABASE_URL=postgresql://… npm test
const url = process.env.TEST_DATABASE_URL

// Arranca como server/index.js: carga lo guardado (o los datos de prueba) y guarda después de cada petición
async function arrancar(pool) {
  const estado = await cargar(pool)
  const db = guardador(pool, { error: (e) => { throw e.err } })
  const app = build({ estado, guardar: db.guardar, superadmins: [{ name: 'Admin Prueba', email: 'admin@empresa.com', password: 'Admin#Prueba2026' }] })
  if (estado) db.yaGuardado(estado)
  await db.guardar(app.estado)
  return { app, db }
}

test('PostgreSQL: primera carga con los datos de prueba; lo que cambia sobrevive a un reinicio', { skip: !url && 'sin TEST_DATABASE_URL' }, async () => {
  const pool = await conectar(url)
  try {
    await pool.query('drop table if exists departamentos, usuarios, actividades, notificaciones, herencias, sesiones, registros, checador, ids')
    const limpio = await conectar(url)
    await limpio.end()
    assert.equal(await cargar(pool), null) // vacía

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
  } finally {
    await pool.end()
  }
})
