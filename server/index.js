import { build } from './app.js'

const app = build({ logger: true })
// Render asigna el puerto en PORT y necesita escuchar en 0.0.0.0
await app.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' })
