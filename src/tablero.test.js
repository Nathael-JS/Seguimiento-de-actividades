import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resumenArea } from './tablero.js'

const act = (id, status, pct, shift, date = '2026-11-02') => ({ id, status, pct, shift, date, text: `a${id}` })
// Gerente → Senior S → Full F → Técnico T1; Senior S → Técnico T2 (sin actividades)
const equipo = [
  { no: 'S', name: 'Sara', role: 'sr', boss: 'G', shift: 'A', actividades: [act(1, 'progress', 50, 'A')] },
  { no: 'F', name: 'Fer', role: 'full', boss: 'S', shift: 'B', actividades: [] },
  { no: 'T1', name: 'Tomás', role: 'tec', boss: 'F', shift: 'B', actividades: [act(2, 'done', 100, 'B'), act(3, 'incomplete', 40, 'B', '2026-10-30'), act(4, 'pending', 0, 'C', '2026-10-31')] },
  { no: 'T2', name: 'Tere', role: 'jr', boss: 'S', shift: 'A', actividades: [] },
]

test('resumen del área: por líder con toda su rama, por turno y alertas', () => {
  const r = resumenArea(equipo, '2026-11-02')
  const [sara, fer] = r.lideres
  assert.deepEqual([sara.personas, sara.actividades, sara.realizadas, sara.incompletas, sara.avance], [3, 4, 1, 1, 25]) // avance: % realizadas
  assert.deepEqual([fer.personas, fer.actividades, fer.avance], [1, 3, 33])
  assert.deepEqual(r.turnos.map((x) => [x.turno, x.personas, x.actividades]), [['A', 2, 1], ['B', 2, 2], ['C', 0, 1]])
  assert.deepEqual(r.incompletas.map((a) => [a.id, a.persona]), [[3, 'Tomás']])
  assert.deepEqual(r.atrasadas.map((a) => a.id), [4]) // la incompleta no se repite aquí
  assert.deepEqual(r.sinActividades.map((e) => e.no), ['T2']) // los líderes sin actividades no cuentan
})

test('equipo vacío no rompe ni divide entre cero', () => {
  const r = resumenArea([], '2026-11-02')
  assert.deepEqual([r.lideres, r.incompletas, r.atrasadas, r.sinActividades], [[], [], [], []])
  assert.ok(r.turnos.every((x) => x.avance === null && x.actividades === 0))
})
