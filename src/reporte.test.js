import { test } from 'node:test'
import assert from 'node:assert/strict'
import { comparar } from './reporte.js'

const user = { no: 'G', name: 'Gina', role: 'gte' }
const equipo = [
  { no: 'F', name: 'Fer', role: 'full', boss: 'G' },
  { no: 'T1', name: 'Tomás', role: 'tec', boss: 'F' },
  { no: 'T2', name: 'Tere', role: 'tec', boss: 'G' },
]
// Fechas de trabajo y doneAt pensados para que el día local no dependa de la zona del entorno de prueba
const f = (id, no, date, status, pct, extra = {}) => ({ id, no, date, status, pct, ...extra })
const filas = [
  f(1, 'T1', '2026-10-29', 'done', 100, { doneAt: '2026-10-29T12:00:00' }), // a tiempo
  f(2, 'T1', '2026-10-29', 'done', 100, { doneAt: '2026-10-31T12:00:00' }), // tarde
  f(3, 'T1', '2026-10-30', 'progress', 50), // atrasada
  f(4, 'T1', '2026-11-02', 'pending', 0), // de hoy: aún no cuenta para el % a tiempo
  f(5, 'T2', '2026-10-30', 'incomplete', 40),
  f(6, 'T2', '2026-10-30', 'pending', 0, { heredadaA: 'Tomás' }), // heredada: cuenta como no realizada, no como atrasada
]

test('comparativo por empleado: % a tiempo, incompletas y atrasadas', () => {
  const { empleados } = comparar(filas, equipo, user, '2026-11-02')
  const [tomas, tere] = empleados
  assert.deepEqual([tomas.no, tomas.actividades, tomas.realizadas, tomas.aTiempo, tomas.atrasadas], ['T1', 4, 2, 33, 1])
  assert.deepEqual([tere.no, tere.aTiempo, tere.incompletas, tere.atrasadas], ['T2', 0, 1, 0])
})

test('comparativo por líder: cada uno con toda su rama, sin líderes vacíos', () => {
  const { lideres } = comparar(filas, equipo, user, '2026-11-02')
  assert.deepEqual(lideres.map((l) => [l.no, l.personas, l.actividades]), [['F', 1, 4], ['G', 2, 6]])
  // El líder no se cuenta entre sus personas, aunque tenga actividades propias
  const conPropia = [...filas, f(7, 'F', '2026-10-30', 'done', 100, { doneAt: '2026-10-30T12:00:00' })]
  assert.equal(comparar(conPropia, equipo, user, '2026-11-02').lideres.find((l) => l.no === 'F').personas, 1)
  assert.deepEqual(comparar([], equipo, user, '2026-11-02'), { empleados: [], lideres: [] })
})
