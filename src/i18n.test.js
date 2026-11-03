import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import en from './en.js'
import { CRITICIDADES, DEPARTAMENTOS, ESTADOS, MODULOS, ROLES, reglasPassword } from './comun.js'

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')
// Nombres propios, datos de ejemplo y textos que no son de interfaz: iguales en ambos idiomas
const IGUALES = new Set(['Liquid Cooling', 'SMT', 'Laura Méndez', 'Jorge Salinas', 'Estaciones LC245', 'Escape', 'NFD', 'Simple', 'Normal', 'Senior', 'Content-Type',
  // Navegadores y sistemas (registros) y el área de los super administradores (dato, no interfaz)
  'Edge', 'Opera', 'Firefox', 'Chrome', 'Safari', 'Windows', 'Android', 'Linux', 'Administración'])

// Todo texto entre comillas que parezca de interfaz en español: empieza con mayúscula (o ¿ ¡) y tiene palabras.
// Así entran también los de constantes (SLIDES, FILTROS…), los de condiciones (t(a ? 'x' : 'y')) y los errores
// del servidor que api() traduce, sin depender de cómo se escribió la llamada a t()
function textosDe(codigo) {
  const sinComentarios = codigo.replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  return [...sinComentarios.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)]
    .map((m) => m[1] ?? m[2])
    .filter((s) => /^[¿¡A-ZÁÉÍÓÚÑ]/.test(s) && /[a-záéíóúñ]{3}/.test(s) && !/[<>=]|^[A-Z]+$|^[A-Z][a-z]+[A-Z]/.test(s))
}

test('todo texto de interfaz tiene su versión en inglés', () => {
  const claves = new Set()
  const src = readdirSync(new URL('.', import.meta.url)).filter((f) => /\.jsx?$/.test(f) && !/test|^en\.js$|^i18n\.js$|^main\.jsx$/.test(f))
  for (const archivo of src) for (const s of textosDe(leer(`./${archivo}`))) claves.add(s)
  for (const s of textosDe(leer('../server/app.js'))) claves.add(s)
  // Listas que se traducen al mostrarse (por si alguna empieza en minúscula)
  for (const v of [...Object.values(ROLES), ...Object.values(DEPARTAMENTOS), ...Object.values(ESTADOS), ...Object.values(CRITICIDADES)]) claves.add(v)
  for (const m of MODULOS) { claves.add(m.titulo); if (m.desc) claves.add(m.desc) }
  for (const [texto] of reglasPassword('', '')) claves.add(texto)
  // Y las llamadas t('…') en minúscula ("de", "propone heredar"…)
  for (const archivo of src) for (const [, s] of leer(`./${archivo}`).matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) claves.add(s)

  const faltan = [...claves].filter((k) => !IGUALES.has(k) && !(k in en))
  assert.deepEqual(faltan, [])
  assert.ok(claves.size > 400, `solo se encontraron ${claves.size} textos: revisar la expresión`)
})

test('ninguna traducción quedó igual al español por descuido', () => {
  const iguales = Object.entries(en).filter(([es, ingles]) => es === ingles && /[a-z]{4}/.test(es) && !IGUALES.has(es))
  assert.deepEqual(iguales.map(([es]) => es), [])
})
