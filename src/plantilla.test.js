import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filasDePlantilla } from './plantilla.js'

test('plantilla: lee encabezados en español o inglés, ignora filas vacías y marca celdas inválidas', () => {
  const { faltan, filas } = filasDePlantilla([
    ['Número', 'Nombre', 'Correo', 'Puesto', 'Turno', 'Área', 'Encargado'],
    [40001, 'Valeria Ortiz', 'valeria.ortiz@empresa.com', 'Senior', 'a', null, 10001], // números como número
    [null, null, null, null, null, null, null],
    ['40002', 'Tomás Rincón', 'tomas@empresa.com', 'Técnico', 'D', '', '40001'],
    ['40003', 'Lucía Peña', 'lucia@empresa.com', 'Gerente', 'B', '', '40001'],
  ])
  assert.deepEqual(faltan, [])
  assert.deepEqual(filas[0], { renglon: 2, error: null, fila: { no: '40001', name: 'Valeria Ortiz', email: 'valeria.ortiz@empresa.com', role: 'sr', shift: 'A', area: '', boss: '10001' } })
  assert.deepEqual(filas.map((f) => [f.renglon, f.error]), [[2, null], [4, 'Turno inválido: A, B o C.'], [5, 'Puesto desconocido: usa Técnico, Ing. Jr, Ing. Full o Senior.']])
  assert.equal(filasDePlantilla([['Number', 'Name', 'Email', 'Role', 'Shift', 'Supervisor'], ['40009', 'Ann Lee', 'ann@empresa.com', 'Jr. engineer', 'C', '40001']]).filas[0].fila.role, 'jr')
  assert.deepEqual(filasDePlantilla([['Nombre', 'Correo']]).faltan, ['no', 'role', 'shift', 'boss'])
})
