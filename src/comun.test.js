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
