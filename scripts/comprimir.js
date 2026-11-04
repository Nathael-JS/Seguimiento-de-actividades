// Después de vite build: guarda junto a cada .js/.css/.svg/.html su versión .br (Brotli) y .gz. El servidor
// (@fastify/static con preCompressed) entrega la que el navegador acepta, sin comprimir en cada petición
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

const archivos = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? archivos(join(dir, f)) : [join(dir, f)]))
let antes = 0
let despues = 0
for (const f of archivos('dist').filter((f) => /\.(js|css|svg|html)$/.test(f))) {
  const datos = readFileSync(f)
  const br = brotliCompressSync(datos, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } })
  writeFileSync(`${f}.br`, br)
  writeFileSync(`${f}.gz`, gzipSync(datos, { level: 9 }))
  antes += datos.length
  despues += br.length
}
console.log(`comprimido: ${Math.round(antes / 1024)} kB → ${Math.round(despues / 1024)} kB (brotli)`)
