import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import en from './en.js'
import { DEPARTAMENTOS, ESTADOS, MODULOS, ROLES, reglasPassword } from './comun.js'

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')
const literal = "'((?:[^'\\\\]|\\\\.)*)'"

test('todo texto traducible tiene su versión en inglés', () => {
  const claves = new Set()
  for (const archivo of readdirSync(new URL('.', import.meta.url)).filter((f) => f.endsWith('.jsx'))) {
    const codigo = leer(`./${archivo}`)
    // t('texto') y t(condición ? 'a' : 'b')
    for (const [, s] of codigo.matchAll(new RegExp(`\\bt\\(\\s*${literal}`, 'g'))) claves.add(s)
    for (const [, a, b] of codigo.matchAll(new RegExp(`\\bt\\([^)']*\\?\\s*${literal}\\s*:\\s*${literal}`, 'g'))) claves.add(a).add(b)
  }
  // Listas que se traducen al mostrarse
  for (const archivo of ['./Buzon.jsx', './Reportes.jsx', './Departamentos.jsx', './Registro.jsx']) {
    const codigo = leer(archivo)
    for (const [, lista] of codigo.matchAll(/(?:FILTROS|COLUMNAS|TITULOS) = \[([\s\S]*?)\n?\]|\{\[('Puesto'[^\]]*)\]/g)) {
      for (const [, s] of (lista ?? '').matchAll(new RegExp(`\\[?${literal}`, 'g'))) claves.add(s)
    }
  }
  for (const [, s] of leer('./Departamentos.jsx').matchAll(new RegExp(literal, 'g'))) if (/^[A-ZÁÉÍÓÚ]/.test(s) && s !== 'Puesto') claves.add(s)
  for (const v of [...Object.values(ROLES), ...Object.values(DEPARTAMENTOS), ...Object.values(ESTADOS)]) claves.add(v)
  for (const m of MODULOS) { claves.add(m.titulo); if (m.desc) claves.add(m.desc) }
  for (const [texto] of reglasPassword('', '')) claves.add(texto)
  // Mensajes de error del servidor, que api() traduce
  for (const [, s] of leer('../server/app.js').matchAll(new RegExp(`error: ${literal}`, 'g'))) claves.add(s)

  // Iguales en ambos idiomas
  for (const igual of ['Liquid Cooling', 'SMT', ' ']) claves.delete(igual)
  const faltan = [...claves].filter((k) => !(k in en))
  assert.deepEqual(faltan, [])
  assert.ok(claves.size > 200, `solo se encontraron ${claves.size} textos: revisar las expresiones`)
})
