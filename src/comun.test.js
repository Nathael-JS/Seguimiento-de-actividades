import { test } from 'node:test'
import assert from 'node:assert/strict'
import { modulosDe } from './comun.js'

const rutas = (role, encargado) => modulosDe({ role, encargado }).map((m) => m.ruta)

test('Mis actividades para todos menos el Gerente; Registrar, Monitoreo, Reportes, Herencias, Matriz y Jerarquía solo encargados', () => {
  assert.deepEqual(rutas('tec', false), ['inicio', 'mis-actividades', 'buzon', 'departamentos', 'perfil'])
  assert.deepEqual(rutas('full', true), ['inicio', 'registrar', 'mis-actividades', 'monitoreo', 'reportes', 'herencias', 'matriz', 'jerarquia', 'buzon', 'departamentos', 'perfil'])
  assert.ok(rutas('sr', true).includes('mis-actividades'))
  assert.ok(!rutas('gte', true).includes('mis-actividades'))
})

test('grupoDia: Hoy, Ayer o la fecha, según el día local', async () => {
  const { grupoDia } = await import('./comun.js')
  const ahora = new Date(2026, 10, 2, 9, 0) // 2 nov, 09:00 local
  assert.equal(grupoDia(new Date(2026, 10, 2, 0, 5).toISOString(), ahora), 'Hoy')
  assert.equal(grupoDia(new Date(2026, 10, 1, 23, 59).toISOString(), ahora), 'Ayer')
  assert.match(grupoDia(new Date(2026, 9, 29, 12, 0).toISOString(), ahora), /29/)
})

test('finTurno: la próxima hora de salida del turno, en hora local', async () => {
  const { finTurno } = await import('./comun.js')
  const a = (y, mo, d, h, mi) => new Date(y, mo, d, h, mi)
  assert.deepEqual(finTurno('A', a(2026, 10, 2, 9, 0)), a(2026, 10, 2, 14, 30)) // en su turno: hoy 14:30
  assert.deepEqual(finTurno('B', a(2026, 10, 2, 16, 0)), a(2026, 10, 2, 23, 0))
  assert.deepEqual(finTurno('C', a(2026, 10, 2, 23, 30)), a(2026, 10, 3, 6, 0)) // turno nocturno: sale al día siguiente
  assert.deepEqual(finTurno('C', a(2026, 10, 3, 2, 0)), a(2026, 10, 3, 6, 0))
  assert.deepEqual(finTurno('A', a(2026, 10, 2, 15, 0)), a(2026, 10, 3, 14, 30)) // ya salió: el de mañana
})
