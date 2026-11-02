import { test } from 'node:test'
import assert from 'node:assert/strict'
import { modulosDe } from './comun.js'

const rutas = (role, encargado) => modulosDe({ role, encargado }).map((m) => m.ruta)

test('Mis actividades para todos menos el Gerente; Registrar, Monitoreo y Reportes solo encargados', () => {
  assert.deepEqual(rutas('tec', false), ['inicio', 'mis-actividades', 'buzon', 'departamentos', 'perfil'])
  assert.deepEqual(rutas('full', true), ['inicio', 'registrar', 'mis-actividades', 'monitoreo', 'reportes', 'buzon', 'departamentos', 'perfil'])
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
