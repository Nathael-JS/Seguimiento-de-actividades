import { test } from 'node:test'
import assert from 'node:assert/strict'
import { modulosDe } from './comun.js'

const rutas = (role, encargado) => modulosDe({ role, encargado }).map((m) => m.ruta)

test('Mis actividades para todos menos el Gerente; Registrar, Monitoreo, Reportes, Herencias, Matriz y Jerarquía solo encargados', () => {
  assert.deepEqual(rutas('tec', false), ['inicio', 'mis-actividades', 'buzon', 'departamentos', 'perfil'])
  assert.deepEqual(rutas('full', true), ['inicio', 'mis-actividades', 'tablero', 'herencias', 'buzon', 'monitoreo', 'reportes', 'matriz', 'jerarquia', 'departamentos', 'perfil'])
  assert.ok(rutas('sr', true).includes('mis-actividades'))
  assert.ok(!rutas('gte', true).includes('mis-actividades'))
  assert.ok(rutas('gte', true).includes('ajustes') && !rutas('sr', true).includes('ajustes')) // Ajustes: solo el gerente
  assert.deepEqual(rutas('sa', false), ['usuarios', 'registros', 'perfil']) // el super administrador solo administra
  assert.ok(!rutas('gte', true).includes('usuarios'))
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

test('turnoDe: el turno de cada hora del día, también el C que cruza la medianoche', async () => {
  const { turnoDe, RANGOS } = await import('./comun.js')
  assert.deepEqual(RANGOS, { A: [6, 14.5], B: [14.5, 23], C: [23, 30] })
  assert.deepEqual([6, 14.4, 14.5, 22.9, 23, 0, 5.9].map(turnoDe), ['A', 'A', 'B', 'B', 'C', 'C', 'C'])
})

test('dispositivo: navegador y sistema a partir del user-agent', async () => {
  const { dispositivo } = await import('./comun.js')
  assert.equal(dispositivo('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0'), 'Edge · Windows')
  assert.equal(dispositivo('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'), 'Safari · iOS')
  assert.equal(dispositivo('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36'), 'Chrome · Android')
  assert.equal(dispositivo('Prueba/1.0'), 'Prueba/1.0')
  assert.equal(dispositivo(''), '—')
})
