import { build } from './app.js'

// trustProxy: Render atiende HTTPS y pasa la petición por un proxy; así req.protocol es 'https' (cookie Secure)
const app = build({ logger: true, trustProxy: true })
// Render asigna el puerto en PORT y necesita escuchar en 0.0.0.0
await app.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' })
