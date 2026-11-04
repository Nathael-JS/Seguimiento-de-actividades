import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { existsSync, readFileSync } from 'node:fs'
import { createHmac, randomBytes, randomInt, randomUUID, scrypt, scryptSync, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { respaldo } from './db.js'

const leer = (archivo) => JSON.parse(readFileSync(new URL(archivo, import.meta.url)))
const dist = new URL('../dist/', import.meta.url)

// Menor número = más rango. Encargados: Gerente, Senior, Ing. Full
const RANGO = { gte: 0, sr: 1, full: 2, jr: 3, tec: 4 }
const esEncargado = (u) => RANGO[u.role] <= 2
// Super administrador: fuera de los departamentos; maneja usuarios y registros
const esSA = (u) => u?.role === 'sa'
const ESTADOS = ['done', 'progress', 'pending', 'incomplete']

const noEmpleado = { type: 'string', pattern: '^\\d{1,10}$' }
const texto = (max) => ({ type: 'string', maxLength: max })
const porEmpleado = { params: { type: 'object', properties: { no: noEmpleado } } }
// Criticidad de una actividad diaria; la crítica va debajo de la urgente pero sí se hereda (ver /heredar).
// 'nueva': recién creada en el Tablero, por clasificar (cuenta como normal al ordenar)
const criticidad = { enum: ['nueva', 'simple', 'normal', 'alta', 'critica'] }
// Tarea recurrente: al llegar su siguiente periodo se crea una copia nueva (ver renovarRecurrentes)
const PERIODOS = ['diaria', 'semanal', 'mensual']
const recurrencia = { enum: PERIODOS }
const PESO_CRITICIDAD = { simple: 0, nueva: 1, normal: 1, alta: 2, critica: 3 }
// desde: inicio del día local de quien consulta (instante UTC). Con él solo se ven las abiertas y las realizadas hoy
// hoy: fecha local de quien consulta (AAAA-MM-DD); con ella se generan los avisos de atraso
// zona: zona horaria IANA del navegador (America/Mexico_City); con hoy, calcula el rate de aprobación
const consulta = {
  type: 'object',
  properties: {
    desde: { type: 'string', format: 'date-time' },
    hoy: { type: 'string', format: 'date' },
    zona: { type: 'string', maxLength: 64, pattern: '^[A-Za-z_+\\-/0-9]+$' },
  },
}
const conDesde = { ...porEmpleado, querystring: consulta }
const conRate = { querystring: consulta }
const notificacionSchema = { params: { type: 'object', properties: { no: noEmpleado, id: { type: 'integer', minimum: 1 } } } }
const token = { type: 'string', minLength: 1, maxLength: 64 }
// Mínimo 10 caracteres, mayúscula, minúscula, número y símbolo (las mismas reglas que muestra el frontend)
const passwordNueva = {
  type: 'string', minLength: 10, maxLength: 100,
  pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9])',
}
const claveDepto = { type: 'string', pattern: '^[a-z0-9-]{1,20}$' }
const objeto = (requeridos, properties) => ({ type: 'object', required: requeridos, additionalProperties: false, properties })

const crearDeptoSchema = { body: objeto(['por', 'nombre'], { por: noEmpleado, nombre: { type: 'string', minLength: 3, maxLength: 60, pattern: '\\S' } }) }
// Una fila por empleado; las reglas que dependen de otros (encargado, correo repetido) las revisa el servidor
const filaPlantilla = objeto(['no', 'name', 'email', 'role', 'shift', 'boss'], {
  no: { type: 'string', pattern: '^\\d{4,10}$' },
  name: { type: 'string', minLength: 3, maxLength: 100, pattern: '\\S' },
  email: { type: 'string', format: 'email', maxLength: 100 },
  role: { enum: ['tec', 'jr', 'full', 'sr'] },
  shift: { enum: ['A', 'B', 'C'] },
  area: { type: 'string', maxLength: 100 },
  boss: { type: 'string', pattern: '^\\d{1,10}$' },
})
const plantillaSchema = {
  params: { type: 'object', properties: { clave: claveDepto } },
  body: objeto(['por', 'filas'], {
    por: noEmpleado,
    filas: { type: 'array', minItems: 1, maxItems: 500, items: filaPlantilla },
    soloRevisar: { type: 'boolean' },
  }),
}
// Super administrador. :empleado (no :no) porque :no se reserva para "mi propia cuenta"
const porEmpleadoAdmin = { params: { type: 'object', properties: { empleado: noEmpleado } } }
const confirmarSchema = { body: objeto(['por', 'password'], { por: noEmpleado, password: { type: 'string', minLength: 1, maxLength: 100 } }) }
const editarUsuarioSchema = {
  ...porEmpleadoAdmin,
  body: objeto(['por'], {
    por: noEmpleado, shift: { enum: ['A', 'B', 'C'] }, role: { enum: ['tec', 'jr', 'full', 'sr', 'gte'] }, activo: { type: 'boolean' },
  }),
}
const accionAdminSchema = { ...porEmpleadoAdmin, body: objeto(['por'], { por: noEmpleado }) }
const fecha = { type: 'string', format: 'date' }
const registrosSchema = { querystring: objeto([], { q: { type: 'string', maxLength: 100 }, evento: { type: 'string', maxLength: 40 }, desde: fecha, hasta: fecha }) }
const purgarSchema = { body: objeto(['por', 'antes'], { por: noEmpleado, antes: fecha }) }
const verificarSchema = { body: objeto(['token', 'codigo'], { token, codigo: { type: 'string', pattern: '^\\d{6}$' } }) }
const registroSchema = {
  body: objeto(['name', 'no', 'email', 'role', 'dept', 'shift', 'password'], {
    name: { type: 'string', minLength: 3, maxLength: 100, pattern: '\\S' },
    no: { type: 'string', pattern: '^\\d{4,10}$' },
    email: { type: 'string', format: 'email', maxLength: 100 },
    role: { enum: ['tec', 'jr', 'full', 'sr', 'gte'] },
    dept: claveDepto,
    shift: { enum: ['A', 'B', 'C'] },
    boss: noEmpleado,
    area: { type: 'string', maxLength: 100 },
    password: passwordNueva,
  }),
}
const recuperarSchema = { body: objeto(['no', 'email'], { no: noEmpleado, email: { type: 'string', maxLength: 100 }, codigo: { type: 'string', pattern: '^\\d{6}$' } }) }
const cambiarSchema = { body: objeto(['token', 'password'], { token, password: passwordNueva }) }
const cambiarPropiaSchema = { ...porEmpleado, body: objeto(['actual', 'nueva'], { actual: texto(100), nueva: passwordNueva }) }

const loginSchema = {
  body: {
    type: 'object',
    required: ['usuario', 'password'],
    additionalProperties: false,
    properties: {
      usuario: { type: 'string', minLength: 1, maxLength: 100, pattern: '\\S' },
      password: { type: 'string', minLength: 1, maxLength: 100 },
      // Acceso por el que entra: Gerencia (Gerente, Senior, Ing. Full) o Jr / Técnico
      tipo: { enum: ['gerencia', 'operativo'] },
    },
  },
}

const registrarSchema = {
  body: {
    type: 'object',
    required: ['por', 'para', 'fecha', 'turno', 'puntos'],
    additionalProperties: false,
    properties: {
      por: noEmpleado,
      para: noEmpleado,
      fecha: { type: 'string', format: 'date' },
      turno: { enum: ['A', 'B', 'C'] },
      puntos: {
        type: 'array',
        minItems: 1,
        maxItems: 20,
        items: {
          type: 'object',
          // Sin porcentaje: el avance lo da el estado (nace pendiente; Realizada = hecha)
          required: ['texto'],
          additionalProperties: false,
          properties: {
            texto: { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' },
          },
        },
      },
      comentario: texto(500),
      // Diaria (estándar) o urgente; la urgente trae el fin del turno elegido, en la hora del navegador
      prioridad: { enum: ['diaria', 'urgente'] },
      criticidad,
      cierre: { type: 'string', format: 'date-time' },
      recurrencia,
    },
  },
}

const actualizarSchema = {
  params: { type: 'object', properties: { id: { type: 'integer', minimum: 1 } } },
  body: {
    type: 'object',
    required: ['por', 'estado'],
    additionalProperties: false,
    properties: {
      por: noEmpleado,
      estado: { enum: ESTADOS },
      nota: texto(500),
    },
  },
}

// Tarea que registra el propio técnico / Ing. Jr. cierre: fin de su turno (instante UTC calculado en su navegador)
const propiaSchema = {
  body: objeto(['por', 'textos', 'prioridad', 'hoy'], {
    por: noEmpleado,
    // Una o varias (Tablero: una por renglón); el encargado recibe un solo aviso
    textos: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' } },
    prioridad: { enum: ['diaria', 'urgente'] },
    criticidad,
    hoy: { type: 'string', format: 'date' },
    cierre: { type: 'string', format: 'date-time' },
    recurrencia,
  }),
}

// Editar una actividad ya creada. recurrencia 'no' la deja de repetir
const editarSchema = {
  params: { type: 'object', properties: { id: { type: 'integer', minimum: 1 } } },
  body: objeto(['por'], {
    por: noEmpleado,
    texto: { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' },
    comentario: { type: 'string', maxLength: 500 },
    fecha: { type: 'string', format: 'date' },
    turno: { enum: ['A', 'B', 'C'] },
    recurrencia: { enum: ['no', ...PERIODOS] },
  }),
}

// Tarea guardada (plantilla personal para reutilizar), con su criticidad
const guardadaSchema = {
  body: objeto(['por', 'texto', 'criticidad'], {
    por: noEmpleado,
    texto: { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' },
    criticidad: { enum: ['simple', 'normal', 'alta', 'critica'] },
    comentario: { type: 'string', maxLength: 500 },
    recurrencia,
  }),
}

const comentario = { type: 'string', minLength: 1, maxLength: 300, pattern: '\\S' }
const responderSchema = {
  params: { type: 'object', properties: { id: { type: 'integer', minimum: 1 } } },
  body: objeto(['por', 'accion', 'hoy'], {
    por: noEmpleado, accion: { enum: ['aceptar', 'rechazar', 'redirigir'] }, comentario, para: noEmpleado,
    hoy: { type: 'string', format: 'date' },
  }),
}
const heredarSchema = {
  params: { type: 'object', properties: { id: { type: 'integer', minimum: 1 } } },
  body: {
    type: 'object',
    required: ['por', 'para', 'hoy', 'motivo'],
    additionalProperties: false,
    // hoy: la fecha local de quien hereda; la del servidor es UTC y de noche ya es mañana en México
    properties: { por: noEmpleado, para: noEmpleado, hoy: { type: 'string', format: 'date' }, motivo: comentario },
  },
}

const fechaSchema = { type: 'string', format: 'date' }
const matrizSchema = {
  ...porEmpleado,
  querystring: objeto(['desde', 'hasta', 'hoy'], { desde: fechaSchema, hasta: fechaSchema, hoy: fechaSchema }),
}
const reporteSchema = {
  body: {
    type: 'object',
    required: ['por', 'empleados', 'desde', 'hasta'],
    additionalProperties: false,
    properties: {
      por: noEmpleado,
      empleados: { type: 'array', minItems: 1, maxItems: 500, uniqueItems: true, items: noEmpleado },
      desde: { type: 'string', format: 'date' },
      hasta: { type: 'string', format: 'date' },
      turno: { enum: ['A', 'B', 'C'] },
    },
  },
}

// Instante exacto en UTC; cada navegador lo muestra en su hora local
const ahora = () => new Date().toISOString()
const DIA = 86_400_000
const VIGENCIA_PASSWORD = 90 // días
// Fecha del navegador aceptable: a un día o menos de la del servidor (cubre cualquier zona horaria)
const hoyValido = (hoy) => Math.abs(Date.parse(hoy) - Date.parse(new Date().toISOString().slice(0, 10))) <= DIA
const diasPassword = (u) => VIGENCIA_PASSWORD - Math.floor((Date.now() - Date.parse(u.pwdChanged)) / DIA)

// MFA con app autenticadora (TOTP, RFC 6238): HMAC-SHA1 del paso de 30 s, 6 dígitos. La clave va en base32,
// que es como la leen Google / Microsoft Authenticator
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const aBase32 = (buf) => [...buf].map((b) => b.toString(2).padStart(8, '0')).join('').match(/.{5}/g)
  .map((bits) => BASE32[parseInt(bits, 2)]).join('') // 20 bytes = 160 bits = 32 caracteres exactos
const deBase32 = (s) => Buffer.from([...s].map((c) => BASE32.indexOf(c).toString(2).padStart(5, '0')).join('')
  .match(/.{8}/g).map((bits) => parseInt(bits, 2)))
const pasoActual = () => Math.floor(Date.now() / 30_000)
export function totp(secreto, paso = pasoActual()) {
  const contador = Buffer.alloc(8)
  contador.writeBigUInt64BE(BigInt(paso))
  const h = createHmac('sha1', deBase32(secreto)).update(contador).digest()
  return String((h.readUInt32BE(h[19] & 0xf) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}
// Paso del código si es válido: se tolera ±30 s de desfase del reloj del teléfono y un código ya usado no se
// acepta otra vez (alguien que lo vea en pantalla no puede reutilizarlo)
const pasoDelCodigo = (secreto, codigo, ultimo = -1) =>
  [pasoActual() - 1, pasoActual(), pasoActual() + 1].find((p) => p > ultimo && totp(secreto, p) === codigo)
const APP_MFA = 'Seguimiento de Actividades'

// Contraseñas con scrypt ("scrypt$sal$hash" en base64): nunca se guardan ni se pueden ver tal cual
const scryptAsync = promisify(scrypt)
const formato = (sal, hash) => `scrypt$${sal.toString('base64')}$${hash.toString('base64')}`
export const hashSync = (password) => { const sal = randomBytes(16); return formato(sal, scryptSync(password, sal, 64)) }
const coincideSync = (guardada, intento) => {
  const [tipo, sal, hash] = String(guardada).split('$')
  return tipo === 'scrypt' && timingSafeEqual(scryptSync(intento, Buffer.from(sal, 'base64'), 64), Buffer.from(hash, 'base64'))
}
const hashPassword = async (password) => { const sal = randomBytes(16); return formato(sal, await scryptAsync(password, sal, 64)) }
// Con un usuario que no existe se compara contra un hash cualquiera: tarda lo mismo y no delata qué usuarios hay
const HASH_FALSO = hashSync(randomUUID())
async function passwordCorrecta(guardada, intento) {
  const [tipo, sal, hash] = (guardada ?? HASH_FALSO).split('$')
  if (tipo !== 'scrypt') return false
  const esperado = Buffer.from(hash, 'base64')
  const real = await scryptAsync(intento, Buffer.from(sal, 'base64'), esperado.length)
  return timingSafeEqual(real, esperado) && !!guardada
}
// Temporal que da el super administrador: cumple las reglas (mayúscula, minúscula, número, símbolo, 10+)
const passwordTemporal = () => `Tmp-${aBase32(randomBytes(5))}!${randomInt(10, 100)}`
const SIGUIENTE_TURNO = { A: 'B', B: 'C', C: 'A' }
// Fin de cada turno en minutos desde la medianoche del día en que empieza (el C termina al día siguiente)
const FIN_TURNO = { A: 14 * 60 + 30, B: 23 * 60, C: 30 * 60 }
const minutos = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))
// Minutos que salió después del fin de su turno; la salida antes de la entrada es del día siguiente
const tiempoExtra = ({ entrada, salida }, turno) =>
  Math.max(0, minutos(salida) + (salida < entrada ? 1440 : 0) - FIN_TURNO[turno])
const diaHabil = (fecha) => new Date(fecha).getUTCDay() % 6 !== 0 // lunes a viernes
// Fechas AAAA-MM-DD se leen como medianoche UTC, así que sumar 24 h nunca salta ni repite un día
const sumarDias = (fecha, n) => new Date(Date.parse(fecha) + n * 86_400_000).toISOString().slice(0, 10)
const diaSiguiente = (fecha) => sumarDias(fecha, 1)
// Siguiente fecha de una recurrente: diaria = siguiente día hábil; semanal = +7 días; mensual = el mismo día
// del mes siguiente (diaMes; si ese mes no lo tiene, su último día: 31 → 30 de abril → 31 de mayo)
export function siguienteFecha(fecha, periodo, diaMes) {
  if (periodo === 'semanal') return sumarDias(fecha, 7)
  if (periodo === 'mensual') {
    const [a, m] = fecha.split('-').map(Number) // m es el mes actual en 1..12 = el siguiente en 0..11
    const ultimo = new Date(Date.UTC(a, m + 1, 0)).getUTCDate()
    return new Date(Date.UTC(a, m, Math.min(diaMes ?? Number(fecha.slice(8)), ultimo))).toISOString().slice(0, 10)
  }
  let f = diaSiguiente(fecha)
  while (!diaHabil(f)) f = diaSiguiente(f)
  return f
}
const conRecurrencia = (periodo, fecha) => (periodo ? { recurrencia: periodo, ...(periodo === 'mensual' && { diaMes: Number(fecha.slice(8)) }) } : {})
const zonaValida = (zona) => {
  try { return !!new Intl.DateTimeFormat('en', { timeZone: zona }) } catch { return false }
}

// superadmins: [{ name, email, password, no? }] (de la variable de entorno SUPERADMINS; ver server/index.js)
// estado: los datos cargados de PostgreSQL (server/db.js); sin él, los de prueba (JSON) en memoria.
// guardar(estado): se llama después de cada petición a la API, antes de responder, para escribir lo que cambió
// salud(): revisa la base para /api/salud (Render no manda tráfico a una versión que no responde)
// cuentasPrueba: false (CUENTAS_PRUEBA=no en Render) apaga las cuentas de prueba: no entran ni sus sesiones sirven
export function build({ superadmins = [], estado: cargado, guardar, salud, cuentasPrueba = true, ...opts } = {}) {
  // Número corto por petición: va en el log y en el mensaje de error, para encontrar el caso en Render
  const app = Fastify({ genReqId: () => randomBytes(4).toString('hex'), ...opts })
  // Errores no previstos (500): se registran con su número y el navegador recibe un mensaje sin detalles internos.
  // Los 4xx (validación, ruta inexistente) siguen como los da Fastify
  app.setErrorHandler((err, req, reply) => {
    if (err.statusCode >= 400 && err.statusCode < 500) return reply.send(err)
    req.log.error({ err }, 'error no controlado')
    return reply.code(500).send({ error: 'Ocurrió un error en el servidor. Si se repite, comparte este código: {codigo}', codigo: req.id })
  })
  // Con base de datos se guarda lo que cambió antes de responder. Las consultas (GET) no se guardan: lo poco que
  // generan (avisos automáticos) se vuelve a generar o se guarda con la siguiente escritura
  if (guardar) {
    app.addHook('onSend', async (req, reply, payload) => {
      if (req.method === 'GET' || !req.url.startsWith('/api/')) return payload
      try {
        await guardar(app.estado)
        return payload
      } catch {
        // Otra instancia más nueva tomó la base (un redeploy): esta ya no guarda y el navegador debe recargar
        reply.code(503).header('content-type', 'application/json; charset=utf-8')
        return JSON.stringify({ error: 'El sistema se actualizó. Recarga la página e intenta de nuevo.' })
      }
    })
  }

  const usuarios = cargado?.usuarios ?? leer('./usuarios.json')
  // Super administradores: se agregan o actualizan por correo y conservan su MFA; los que ya no están en la
  // variable pierden el acceso
  const correosSA = superadmins.map((sa) => sa.email.trim().toLowerCase())
  superadmins.forEach((sa, i) => {
    const u = usuarios.find((x) => x.email === correosSA[i])
    if (u) {
      Object.assign(u, { name: sa.name, role: 'sa', activo: true })
      if (!coincideSync(u.password, sa.password)) Object.assign(u, { password: hashSync(sa.password), pwdChanged: ahora() })
      return
    }
    let no = Number(sa.no ?? 90001 + i)
    while (usuarios.some((x) => x.no === String(no))) no++
    usuarios.push({
      no: String(no), name: sa.name, email: correosSA[i], role: 'sa', dept: null, boss: null,
      shift: 'A', area: 'Administración', pwdChanged: ahora(), password: hashSync(sa.password),
    })
  })
  usuarios.forEach((u) => { if (u.role === 'sa' && !correosSA.includes(u.email)) u.activo = false })
  // Registro de auditoría: quién entra, desde dónde y qué cambia un super administrador.
  // Se guardan los últimos 5000 (también van al log del servidor, que Render guarda)
  const registros = cargado?.registros ?? []
  // IP del equipo: la última que agregó el proxy de Render a X-Forwarded-For (las anteriores las puede inventar
  // quien hace la petición). shortcut: si Render agrega otro salto de proxy, revisar en sus registros cuál es la real
  const ipDe = (req) => req.ips?.[1] ?? req.ip
  const registrar = (req, evento, datos = {}) => {
    const r = {
      id: (registros.at(-1)?.id ?? 0) + 1, at: ahora(), evento, ip: ipDe(req),
      agente: String(req.headers['user-agent'] ?? '').slice(0, 300), ok: true, ...datos,
    }
    registros.push(r)
    if (registros.length > 5000) registros.shift()
    req.log.info({ registro: r }, evento)
  }
  const actividades = cargado?.actividades ?? leer('./actividades.json')
  const notificaciones = cargado?.notificaciones ?? leer('./notificaciones.json')
  const herencias = cargado?.herencias ?? [] // propuestas de herencia: pendientes de validar y su historial
  const guardadas = cargado?.guardadas ?? [] // tareas guardadas: plantillas personales para reutilizar
  // Los de los mockups y los que crea un gerente, que queda como quien lo dirige
  const departamentos = cargado?.departamentos ?? [
    { clave: 'lc', nombre: 'Liquid Cooling', gerente: '10001' },
    { clave: 'pf', nombre: 'Pruebas Funcionales', gerente: '10700' },
    { clave: 'smt', nombre: 'SMT', gerente: null },
  ]
  // shortcut: checador simulado (entrada/salida en hora de planta, lunes a viernes, oct–dic 2026); cambiar por el real
  const checador = cargado?.checador ?? leer('./checador.json')
  // Códigos de verificación y permisos de recuperación pendientes, por token
  const verificaciones = new Map()
  const recuperaciones = new Map()
  const limpiarVencidos = (mapa) => mapa.forEach((v, k) => v.vence < Date.now() && mapa.delete(k))
  // Nunca se repite un número aunque se borre el último (los avisos y herencias guardan el número)
  const ultimosIds = cargado?.ultimosIds ?? new Map()
  const siguienteId = (lista) => {
    const n = Math.max(ultimosIds.get(lista) ?? 0, ...lista.map((x) => x.id)) + 1
    ultimosIds.set(lista, n)
    return n
  }

  const empleado = (no) => usuarios.find((u) => u.no === no)
  // Acepta correo completo, la parte antes de la @ o el número de empleado
  const buscar = (id) =>
    usuarios.find((u) => u.email === id || u.email.split('@')[0] === id || u.no === id)
  // Departamentos de alguien: el suyo y los que dirige como gerente
  const deptosDe = (no) => [...new Set([empleado(no)?.dept, ...departamentos.filter((d) => d.gerente === no).map((d) => d.clave)])]
  // Todos los empleados debajo de `no` en la jerarquía, directos e indirectos; nunca de un departamento ajeno
  const equipo = (no, depts = deptosDe(no)) =>
    usuarios.filter((u) => u.boss === no && depts.includes(u.dept)).flatMap((u) => [u, ...equipo(u.no, depts)])
  // A quién puede asignar un encargado: su equipo, solo con menor rango que él
  const asignables = (u) => equipo(u.no).filter((e) => RANGO[e.role] > RANGO[u.role])
  // Una actividad heredada queda en el historial (reportes) pero sale de listas e indicadores
  const vigentes = () => actividades.filter((a) => !a.handedTo)
  // Lo del turno: lo que sigue abierto y lo realizado desde `desde`. Sin `desde`, todo
  // Avisos automáticos, una sola vez cada uno:
  // - actividad pendiente o en proceso con fecha anterior a hoy → al ejecutor y a quien la asignó
  // - contraseña que vence en 15 días o menos → a su dueño (otra vez solo si la cambia y vuelve a acercarse)
  // shortcut: se generan al consultar Inicio porque no hay tareas programadas; pasar a un job con la base de datos
  const generarAvisos = (hoy) => {
    renovarRecurrentes(hoy)
    for (const a of vigentes()) {
      // Misma regla de "atrasada" que src/tablero.js (Inicio del gerente): si cambia una, cambiar la otra
      if (a.avisoAtraso || (a.status !== 'pending' && a.status !== 'progress') || a.date >= hoy) continue
      a.avisoAtraso = true
      notificar({ for: a.to, kind: 'overdue', ref: a.id })
      notificar({ for: responsable(a), kind: 'overdue', who: a.to, ref: a.id })
    }
    for (const u of usuarios) {
      const dias = diasPassword(u)
      if (dias > 15 || u.avisoPassword === u.pwdChanged) continue
      u.avisoPassword = u.pwdChanged
      notificar({ for: u.no, kind: 'password', count: Math.max(dias, 0) })
    }
  }
  // Recurrentes: la última copia de cada una lleva la recurrencia. Cuando su siguiente fecha ya llegó, la
  // recurrencia pasa a una copia nueva pendiente con la fecha más reciente que toca (no se crean las de días
  // sin entrar al sistema); la anterior queda como una tarea normal (si no se hizo, cuenta como atrasada).
  // Una heredada (handedTo) sigue renovándose para su dueño. Sin aviso: llega a su lista cada periodo
  const renovarRecurrentes = (hoy) => {
    for (const a of actividades.filter((x) => x.recurrencia)) {
      let fecha = a.date
      for (let f = siguienteFecha(fecha, a.recurrencia, a.diaMes); f <= hoy; f = siguienteFecha(f, a.recurrencia, a.diaMes)) fecha = f
      if (fecha === a.date) continue
      const { to, by, shift, text, mgr, prioridad, criticidad, propia, recurrencia, diaMes } = a
      actividades.push({
        id: siguienteId(actividades), to, by, date: fecha, shift, at: ahora(), text, mgr, note: '', pct: 0, status: 'pending',
        ...(prioridad && { prioridad }), ...(criticidad && { criticidad }), ...(propia && { propia }), recurrencia, ...(diaMes && { diaMes }),
      })
      delete a.recurrencia
      delete a.diaMes
    }
  }
  // Al cambiar la contraseña el aviso de "vence en N días" ya no aplica: se marca como leído, y se cierran
  // las demás sesiones abiertas de esa persona (conservar: la sesión desde la que la cambió, si la hay)
  const cambiarPassword = async (u, password, conservar) => {
    Object.assign(u, { password: await hashPassword(password), pwdChanged: ahora() })
    delete u.debeCambiar
    notificaciones.filter((n) => n.for === u.no && n.kind === 'password').forEach((n) => (n.read = true))
    sesiones.forEach((s, token) => s.no === u.no && token !== conservar && sesiones.delete(token))
  }
  const urgenteAbierta = (a) => a.prioridad === 'urgente' && !a.cerrada && a.status !== 'done'
  const delTurno = (acts, desde) =>
    desde ? acts.filter((a) => a.status !== 'done' || Date.parse(a.doneAt ?? a.at) >= Date.parse(desde)) : acts
  // Cada quien conserva sus últimas 200: el Buzón no muestra más y así la lista no crece para siempre
  const MAX_NOTIFICACIONES = 200
  const notificar = (n) => {
    notificaciones.push({ id: siguienteId(notificaciones), at: ahora(), read: false, ...n })
    const suyas = notificaciones.filter((x) => x.for === n.for)
    if (suyas.length > MAX_NOTIFICACIONES) notificaciones.splice(notificaciones.indexOf(suyas[0]), 1)
  }
  // A quién se avisa de una actividad: quien la asignó, o el encargado del empleado si la registró él mismo
  const responsable = (a) => (a.propia ? empleado(a.to).boss : a.by)
  // Validación de fin de turno: una urgente que llegó a su cierre queda fija en su estado (sin cambios ni herencia);
  // si no llegó al 100 % queda incompleta y se avisa al empleado y a su encargado.
  // shortcut: se revisa en cada petición porque no hay tareas programadas; pasar a un job con la base de datos
  const cerrarUrgentes = () => {
    for (const a of actividades) {
      if (a.prioridad !== 'urgente' || a.cerrada || Date.now() < Date.parse(a.cierreTurno)) continue
      a.cerrada = true
      if (a.status === 'done') continue
      a.status = 'incomplete'
      notificar({ for: a.to, kind: 'urgent-closed', ref: a.id })
      notificar({ for: responsable(a), kind: 'urgent-closed', who: a.to, ref: a.id })
    }
  }
  app.addHook('onRequest', async () => cerrarUrgentes())

  const conEmpleado = (handler) => async (req, reply) => {
    const u = empleado(req.params.no)
    if (!u) return reply.code(404).send({ error: 'Empleado no encontrado.' })
    return handler(u, req, reply)
  }

  const sesion = (u) => ({
    no: u.no, name: u.name, role: u.role, dept: u.dept, shift: u.shift, area: u.area, encargado: esEncargado(u),
    ...(u.debeCambiar && { debeCambiar: true }),
  })

  // Sesiones: token aleatorio en una cookie HttpOnly (el JavaScript de la página no la puede leer) y SameSite=Strict
  // (otros sitios no la mandan). Sin Max-Age: se borra al cerrar el navegador, útil en equipos compartidos de planta.
  // Con DATABASE_URL se guardan en PostgreSQL y sobreviven a un reinicio; sin ella viven en memoria
  const sesiones = cargado?.sesiones ?? new Map()
  const DURACION_SESION = 12 * 3_600_000 // sin actividad; se renueva con cada uso
  const tokenDe = (req) => req.headers.cookie?.match(/(?:^|;\s*)sesion=([^;]+)/)?.[1]
  const cookie = (req, valor, extra = '') =>
    `sesion=${valor}; HttpOnly; SameSite=Strict; Path=/${req.protocol === 'https' ? '; Secure' : ''}${extra}`
  const apagada = (u) => u.prueba && !cuentasPrueba
  const PUBLICAS = new Set([
    '/api/config',
    '/api/login', '/api/login/verificar', '/api/logout',
    '/api/registro', '/api/recuperar', '/api/recuperar/cambiar', '/api/encargados', '/api/deptos', '/api/salud', '/api/errores',
  ])
  const abrirSesion = (req, reply, u) => {
    limpiarVencidos(sesiones)
    const id = randomUUID()
    sesiones.set(id, { no: u.no, vence: Date.now() + DURACION_SESION })
    reply.header('set-cookie', cookie(req, id))
    return sesion(u)
  }
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/') || PUBLICAS.has(req.routeOptions.url)) return
    const s = sesiones.get(tokenDe(req))
    if (!s || s.vence < Date.now() || !empleado(s.no) || apagada(empleado(s.no))) {
      return reply.code(401).send({ error: 'Tu sesión terminó. Vuelve a iniciar sesión.', sesion: false })
    }
    // Se renueva a lo más cada 5 min: así una consulta no reescribe la sesión en la base cada vez
    if (s.vence - Date.now() < DURACION_SESION - 5 * 60_000) s.vence = Date.now() + DURACION_SESION
    req.sesion = s
    // El número que manda el navegador (en la dirección o en "por") tiene que ser el de la sesión
    const quien = req.params?.no ?? req.body?.por
    // otraCuenta: en otra pestaña del mismo navegador se entró con otra cuenta (comparten la cookie)
    if (quien && quien !== s.no) return reply.code(403).send({ error: 'Solo puedes actuar con tu propia cuenta.', otraCuenta: true })
    const yo = empleado(s.no)
    // Con contraseña temporal solo se puede cambiarla (o salir)
    if (yo.debeCambiar && !SIN_CAMBIO.has(req.routeOptions.url)) {
      return reply.code(403).send({ error: 'Cambia tu contraseña temporal para continuar.', debeCambiar: true })
    }
    if (req.url.startsWith('/api/admin/') && !esSA(yo)) return reply.code(403).send({ error: 'Solo un super administrador.' })
  })
  const SIN_CAMBIO = new Set(['/api/sesion', '/api/perfil/:no/password'])

  // Paso 1: usuario y contraseña. Si son correctos se genera el código del paso 2
  // 10 contraseñas incorrectas seguidas desde la misma IP para el mismo usuario bloquean 15 minutos
  const fallosLogin = new Map()
  const BLOQUEO = 15 * 60_000
  // Intentos fallidos por IP y cuenta: contraseña, código de la app y recuperar comparten el mismo bloqueo
  const claveFallos = (req, cuenta) => `${ipDe(req)}|${cuenta}`
  const bloqueado = (clave) => { limpiarVencidos(fallosLogin); return fallosLogin.get(clave)?.n >= 10 }
  const fallar = (clave) => fallosLogin.set(clave, { n: (fallosLogin.get(clave)?.n ?? 0) + 1, vence: Date.now() + BLOQUEO })
  app.post('/api/login', { schema: loginSchema }, async (req, reply) => {
    const usuario = req.body.usuario.trim().toLowerCase()
    const u = buscar(usuario)
    // Por la cuenta encontrada, no por lo escrito: número, correo y usuario del correo son la misma cuenta
    const clave = claveFallos(req, u?.no ?? usuario)
    if (bloqueado(clave)) return reply.code(429).send({ error: 'Demasiados intentos. Espera 15 minutos.' })
    if (!(await passwordCorrecta(u?.password, req.body.password))) {
      registrar(req, 'login-fallido', { no: u?.no, usuario: usuario.slice(0, 100), ok: false })
      fallar(clave)
      return reply.code(401).send({ error: 'Usuario o contraseña incorrectos.' })
    }
    if (u.activo === false || apagada(u)) {
      registrar(req, 'login-bloqueado', { no: u.no, ok: false })
      return reply.code(403).send({ error: 'Tu cuenta no tiene acceso al sistema. Habla con un administrador.' })
    }
    // El super administrador entra por Gerencia
    const { tipo } = req.body
    const gerencia = esEncargado(u) || esSA(u)
    if (tipo && (tipo === 'gerencia') !== gerencia) {
      return reply.code(403).send({ error: gerencia ? 'Esta cuenta es de Gerencia: entra por ese acceso.' : 'Esta cuenta es de Jr / Técnico: entra por ese acceso.' })
    }
    // Las cuentas de prueba (datos de los mockups) entran sin el código de la app para revisiones rápidas;
    // con usuarios reales se apagan con CUENTAS_PRUEBA=no (ver apagada)
    if (u.prueba) {
      registrar(req, 'login', { no: u.no, detalle: 'cuenta de prueba, sin código de la app' })
      fallosLogin.delete(clave)
      return abrirSesion(req, reply, u) // sin token: ya es la sesión
    }
    limpiarVencidos(verificaciones)
    const id = randomUUID()
    // Primera vez: se genera la clave de su app autenticadora y queda guardada al verificar el primer código.
    // Si alguien pierde el teléfono, un super administrador le reinicia el MFA y lo vuelve a vincular.
    // shortcut: el alta va con la contraseña como único respaldo; agregar códigos de respaldo
    const alta = !u.totp && aBase32(randomBytes(20))
    verificaciones.set(id, { no: u.no, intentos: 0, vence: Date.now() + 5 * 60_000, ...(alta && { alta }) })
    if (!alta) return { token: id }
    const cuenta = encodeURIComponent(`${APP_MFA}:${u.email}`)
    return { token: id, secreto: alta, uri: `otpauth://totp/${cuenta}?secret=${alta}&issuer=${encodeURIComponent(APP_MFA)}` }
  })

  // Paso 2: el código de 6 dígitos. Expira a los 5 minutos y admite 5 intentos
  app.post('/api/login/verificar', { schema: verificarSchema }, async (req, reply) => {
    const v = verificaciones.get(req.body.token)
    if (!v || v.vence < Date.now()) {
      verificaciones.delete(req.body.token)
      return reply.code(401).send({ error: 'El código expiró. Vuelve a iniciar sesión.' })
    }
    const u = empleado(v.no)
    const paso = pasoDelCodigo(v.alta ?? u.totp, req.body.codigo, u.totpPaso)
    if (paso === undefined) {
      registrar(req, 'mfa-fallido', { no: u.no, ok: false })
      // También cuenta para el bloqueo del login: así no se puede pedir otra verificación y seguir probando
      fallar(claveFallos(req, u.no))
      if (++v.intentos >= 5) {
        verificaciones.delete(req.body.token)
        return reply.code(401).send({ error: 'Demasiados intentos. Vuelve a iniciar sesión.' })
      }
      return reply.code(401).send({ error: 'Código incorrecto.' })
    }
    verificaciones.delete(req.body.token)
    fallosLogin.delete(claveFallos(req, u.no)) // el contador vuelve a cero solo al entrar de verdad
    Object.assign(u, { totpPaso: paso }, v.alta && { totp: v.alta })
    registrar(req, 'login', { no: u.no, detalle: v.alta ? 'vinculó su app autenticadora' : 'con código de la app' })
    return abrirSesion(req, reply, u)
  })

  // Al recargar la página: quién es la sesión de esta cookie
  app.get('/api/sesion', async (req) => sesion(empleado(req.sesion.no)))

  app.post('/api/logout', async (req, reply) => {
    const s = sesiones.get(tokenDe(req))
    if (s) registrar(req, 'logout', { no: s.no })
    sesiones.delete(tokenDe(req))
    reply.header('set-cookie', cookie(req, '', '; Max-Age=0'))
    return { ok: true }
  })

  app.post('/api/registro', { schema: registroSchema }, async (req, reply) => {
    const { name, no, role, dept, shift, boss, area = '', password } = req.body
    const email = req.body.email.trim().toLowerCase()
    if (empleado(no)) return reply.code(409).send({ error: 'Ese número de empleado ya está registrado.' })
    if (usuarios.some((u) => u.email === email)) return reply.code(409).send({ error: 'Ese correo ya está registrado.' })

    if (!departamentos.some((d) => d.clave === dept)) return reply.code(400).send({ error: 'Ese departamento no existe.' })
    const nuevo = { no, name: name.trim(), role, dept, shift, email, pwdChanged: ahora(), password: await hashPassword(password) }
    if (RANGO[role] <= 2) {
      // Encargado: indica su área; no elige jefe (como en el mockup)
      if (!area.trim()) return reply.code(400).send({ error: 'Escribe tu área dentro del departamento.' })
      Object.assign(nuevo, { boss: null, area: area.trim() })
    } else {
      // Técnico / Ing. Jr: elige a su encargado del mismo departamento y hereda su área
      const jefe = boss && empleado(boss)
      if (!jefe || !esEncargado(jefe) || !deptosDe(jefe.no).includes(dept)) {
        return reply.code(400).send({ error: 'Elige a tu encargado del departamento.' })
      }
      Object.assign(nuevo, { boss, area: jefe.area })
    }
    usuarios.push(nuevo)
    registrar(req, 'registro', { no })
    return reply.code(201).send({ ok: true })
  })

  // Número, correo y el código de la app autenticadora: el número y el correo los conocen los compañeros.
  // Sin app vinculada (cuenta nueva) no se recupera sola: quien la recuperara vincularía su propia app
  app.post('/api/recuperar', { schema: recuperarSchema }, async (req, reply) => {
    const clave = claveFallos(req, `recuperar:${req.body.no}`) // por cuenta: en planta muchos comparten la misma IP
    if (bloqueado(clave)) return reply.code(429).send({ error: 'Demasiados intentos. Espera 15 minutos.' })
    const u = empleado(req.body.no)
    if (!u || u.email !== req.body.email.trim().toLowerCase()) {
      fallar(clave)
      return reply.code(400).send({ error: 'Número de empleado y correo no coinciden con un registro.' })
    }
    if (apagada(u)) return reply.code(403).send({ error: 'Tu cuenta no tiene acceso al sistema. Habla con un administrador.' })
    if (!u.prueba) {
      if (!u.totp) return reply.code(403).send({ error: 'Tu cuenta aún no tiene la app autenticadora: pide a un super administrador que restablezca tu contraseña.' })
      const paso = req.body.codigo && pasoDelCodigo(u.totp, req.body.codigo, u.totpPaso)
      if (paso === undefined) {
        fallar(clave)
        registrar(req, 'mfa-fallido', { no: u.no, ok: false, detalle: 'al recuperar la contraseña' })
        return reply.code(401).send({ error: 'Escribe el código de 6 dígitos de tu app autenticadora.' })
      }
      u.totpPaso = paso // un código no sirve dos veces
    }
    limpiarVencidos(recuperaciones)
    const id = randomUUID()
    recuperaciones.set(id, { no: u.no, vence: Date.now() + 15 * 60_000 })
    return { token: id, name: u.name, no: u.no, email: u.email }
  })

  app.post('/api/recuperar/cambiar', { schema: cambiarSchema }, async (req, reply) => {
    const r = recuperaciones.get(req.body.token)
    recuperaciones.delete(req.body.token) // un solo uso
    if (!r || r.vence < Date.now()) return reply.code(401).send({ error: 'El permiso expiró. Vuelve a validar tus datos.' })
    await cambiarPassword(empleado(r.no), req.body.password)
    registrar(req, 'password-recuperada', { no: r.no })
    return { ok: true }
  })

  // Rate de aprobación: % de las actividades de los últimos 30 días realizadas a tiempo, es decir a más tardar el
  // día que les tocaba (en la hora local de quien consulta). Las de hoy que siguen abiertas aún no cuentan;
  // una heredada a otro cuenta como no realizada por quien la tenía. null: sin actividades en el periodo
  const rateDe = (no, { hoy, zona }) => {
    const desde = sumarDias(hoy, -30)
    const cuentan = actividades.filter((a) =>
      a.to === no && a.date >= desde && a.date <= hoy && (a.status === 'done' || a.date < hoy))
    if (!cuentan.length) return null
    const diaLocal = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: zona })
    const aTiempo = cuentan.filter((a) => a.status === 'done' && diaLocal(a.doneAt ?? a.at) <= a.date)
    return Math.round((aTiempo.length / cuentan.length) * 100)
  }
  // Con hoy y zona válidos se agrega el rate; sin ellos no (Registro, Registrar actividad, Reportes no lo usan)
  const conRateDe = (query) => (query.hoy && query.zona ? (no) => ({ rate: rateDe(no, query) }) : () => ({}))
  app.addHook('preHandler', async (req, reply) => {
    if (req.query?.zona && !zonaValida(req.query.zona)) return reply.code(400).send({ error: 'Zona horaria no válida.' })
  })

  // Registro (sin sesión): a quién se puede elegir como encargado
  // Lo que la pantalla de acceso necesita saber antes de entrar: si muestra el botón de revisión rápida
  app.get('/api/config', async () => ({ cuentasPrueba }))

  app.get('/api/salud', async () => {
    await salud?.()
    return { ok: true }
  })

  // Errores del navegador (pantalla rota, promesa sin atender): quedan en el log de Render con quién y dónde.
  // Público (puede fallar antes de entrar); hasta 10 por IP cada 15 min para que nadie llene el log
  const errorSchema = { body: objeto(['mensaje'], { mensaje: texto(500), pila: { type: 'string', maxLength: 4000 }, ruta: { type: 'string', maxLength: 200 } }) }
  app.post('/api/errores', { schema: errorSchema }, async (req, reply) => {
    const clave = claveFallos(req, 'errores-navegador')
    if (!bloqueado(clave)) {
      fallar(clave)
      req.log.warn({ navegador: req.body, no: sesiones.get(tokenDe(req))?.no, agente: req.headers['user-agent'] }, 'error en el navegador')
    }
    return reply.code(204).send()
  })

  app.get('/api/encargados', async () =>
    usuarios.filter(esEncargado).sort((a, b) => RANGO[a.role] - RANGO[b.role] || a.name.localeCompare(b.name))
      .map(({ no, name, role }) => ({ no, name, role, depts: deptosDe(no) })))

  // Catálogo de departamentos (Registro, sin sesión)
  app.get('/api/deptos', async () => departamentos.map(({ clave, nombre, gerente }) => ({ clave, nombre, gerente })))

  // La plantilla de los departamentos de quien consulta (el suyo y los que dirige): ningún departamento ve a otro
  app.get('/api/departamentos', { schema: conRate }, async (req, reply) => {
    if (!esEncargado(empleado(req.sesion.no))) return reply.code(403).send({ error: 'Solo los encargados ven la plantilla.' })
    const rate = conRateDe(req.query)
    const depts = deptosDe(req.sesion.no)
    return usuarios
      .filter((u) => depts.includes(u.dept))
      .map(({ no, name, role, dept, shift, area }) => ({ no, name, role, dept, shift, area, ...rate(no) }))
      .sort((a, b) => RANGO[a.role] - RANGO[b.role] || a.name.localeCompare(b.name))
  })

  // Un gerente crea un departamento y queda como quien lo dirige
  app.post('/api/departamentos', { schema: crearDeptoSchema }, async (req, reply) => {
    const yo = empleado(req.body.por)
    if (yo?.role !== 'gte') return reply.code(403).send({ error: 'Solo un gerente crea departamentos.' })
    const nombre = req.body.nombre.trim().replace(/\s+/g, ' ')
    if (departamentos.some((d) => d.nombre.toLowerCase() === nombre.toLowerCase())) {
      return reply.code(409).send({ error: 'Ya existe un departamento con ese nombre.' })
    }
    // Clave legible a partir del nombre ("Calidad de Proceso" → calidad-de-proce), única
    const base = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 16) || 'depto'
    let clave = base
    for (let i = 2; departamentos.some((d) => d.clave === clave); i++) clave = `${base.slice(0, 16)}-${i}`
    const d = { clave, nombre, gerente: yo.no }
    departamentos.push(d)
    return reply.code(201).send({ clave, nombre })
  })

  // Plantilla del departamento: el gerente sube a su gente (Excel o CSV, leído en el navegador) y aquí se valida
  // todo junto; si una fila tiene error no se guarda nada. Con soloRevisar solo responde qué haría cada fila.
  // Las personas nuevas no tienen contraseña: la crean con "¿Olvidaste tu contraseña?" (número y correo)
  app.post('/api/departamentos/:clave/plantilla', { schema: plantillaSchema }, async (req, reply) => {
    const { clave } = req.params
    const { por, filas, soloRevisar } = req.body
    const yo = empleado(por)
    if (yo?.role !== 'gte' || !deptosDe(por).includes(clave)) {
      return reply.code(403).send({ error: 'Solo el gerente que dirige el departamento carga su plantilla.' })
    }
    const enArchivo = new Map(filas.map((f) => [f.no, f]))
    const resultado = filas.map((f, i) => {
      const actual = empleado(f.no)
      const jefe = enArchivo.get(f.boss) ?? empleado(f.boss) // puede venir en el mismo archivo
      const jefeDelDepto = jefe && (f.boss === por || enArchivo.has(f.boss) || jefe.dept === clave)
      // Siempre a cargo de alguien de mayor puesto, y sin dejar a nadie a cargo de alguien de igual o menor
      // puesto: así la jerarquía nunca hace ciclos
      const rangoOk = jefe && RANGO[jefe.role] <= 2 && RANGO[jefe.role] < RANGO[f.role] &&
        usuarios.every((u) => u.boss !== f.no || enArchivo.has(u.no) || RANGO[u.role] > RANGO[f.role])
      const error =
        filas.findIndex((x) => x.no === f.no) !== i ? 'Número repetido en el archivo.'
          : f.no === por ? 'Tú no vas en la plantilla: ya diriges el departamento.'
          : actual && actual.dept !== clave ? 'Ese número es de otro departamento.'
          : usuarios.some((u) => u.email === f.email.trim().toLowerCase() && u.no !== f.no) ||
            filas.findIndex((x) => x.email.trim().toLowerCase() === f.email.trim().toLowerCase()) !== i ? 'Ese correo ya lo usa otra persona.'
          : !jefeDelDepto ? 'El encargado no existe en este departamento.'
          : !rangoOk ? 'El encargado debe ser Ing. Full, Senior o Gerente, de mayor puesto que la persona.'
          : null
      return { no: f.no, name: f.name, accion: actual ? 'actualizar' : 'crear', error }
    })
    const conError = resultado.filter((r) => r.error).length
    if (soloRevisar || conError) return reply.code(conError && !soloRevisar ? 400 : 200).send({ filas: resultado, conError })
    // Las nuevas nacen con una contraseña temporal que el gerente ve una sola vez y entrega; al entrar la cambian
    // y vinculan su app. Así nadie más puede reclamar la cuenta con solo su número y correo
    // Los hashes van primero y en paralelo: el guardado de abajo no se interrumpe a medias por otra petición
    const claves = new Map(filas.filter((f) => !empleado(f.no)).map((f) => [f.no, passwordTemporal()]))
    const hashes = new Map(await Promise.all([...claves].map(async ([no, temporal]) => [no, await hashPassword(temporal)])))
    const temporales = []
    for (const f of filas) {
      const datos = { name: f.name.trim(), email: f.email.trim().toLowerCase(), role: f.role, shift: f.shift, boss: f.boss, dept: clave }
      const actual = empleado(f.no)
      if (actual) Object.assign(actual, datos, f.area?.trim() && { area: f.area.trim() })
      else {
        usuarios.push({ no: f.no, ...datos, area: f.area?.trim() || '', pwdChanged: ahora(), password: hashes.get(f.no), debeCambiar: true })
        temporales.push({ no: f.no, name: datos.name, temporal: claves.get(f.no) })
      }
    }
    // El área vacía se hereda del encargado, ya con todos guardados
    for (const f of filas) { const u = empleado(f.no); if (!u.area) u.area = empleado(u.boss)?.area ?? '' }
    return { filas: resultado, conError: 0, creados: temporales.length, actualizados: resultado.length - temporales.length, temporales }
  })

  app.get('/api/perfil/:no', { schema: { ...porEmpleado, querystring: consulta } }, conEmpleado((u, req) => {
    const { no, name, role, dept, shift, area, email, pwdChanged, boss } = u
    return {
      no, name, role, dept, shift, area, email, pwdChanged, ...conRateDe(req.query)(no),
      bossName: empleado(boss)?.name, bossRole: empleado(boss)?.role, diasPassword: diasPassword(u),
    }
  }))

  app.post('/api/perfil/:no/password', { schema: cambiarPropiaSchema }, conEmpleado(async (u, req, reply) => {
    if (!(await passwordCorrecta(u.password, req.body.actual))) return reply.code(401).send({ error: 'La contraseña actual no es correcta.' })
    if (req.body.nueva === req.body.actual) return reply.code(400).send({ error: 'La nueva contraseña debe ser distinta de la actual.' })
    await cambiarPassword(u, req.body.nueva, tokenDe(req))
    registrar(req, 'password-cambiada', { no: u.no })
    return { ok: true }
  }))

  app.get('/api/inicio/:no', { schema: conDesde }, conEmpleado((u, req) => {
    // Un reloj mal puesto en el navegador marcaría como atrasado todo y avisaría a todos, sin vuelta atrás:
    // solo se aceptan fechas a un día o menos de la del servidor (cubre cualquier zona horaria)
    if (req.query.hoy && hoyValido(req.query.hoy)) generarAvisos(req.query.hoy)
    // El encargado ve las suyas y las de su equipo; el ejecutor, solo las suyas
    const alcance = esEncargado(u) ? [u.no, ...equipo(u.no).map((e) => e.no)] : [u.no]
    const acts = delTurno(vigentes().filter((a) => alcance.includes(a.to)), req.query.desde)
    return {
      diasPassword: diasPassword(u),
      asignadas: acts.length,
      realizadas: acts.filter((a) => a.status === 'done').length,
      abiertas: acts.filter((a) => a.status === 'pending' || a.status === 'incomplete').length,
      // % realizadas (ya no hay porcentaje por actividad); null: sin actividades
      avance: acts.length ? Math.round((acts.filter((a) => a.status === 'done').length / acts.length) * 100) : null,
      notificaciones: notificaciones
        .filter((n) => n.for === u.no)
        // Por fecha y no por id: el Buzón agrupa por día y los datos pueden llegar fuera de orden
        .sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id)
        // Las de una actividad eliminada desde el tablero ya no se muestran
        .filter((n) => !n.ref || actividades.some((x) => x.id === n.ref))
        .map((n) => {
          const a = actividades.find((x) => x.id === n.ref)
          return {
            id: n.id,
            kind: n.kind,
            who: empleado(n.who)?.name,
            actividad: a?.text,
            activityTo: a?.to, // de quién es la actividad: decide si se abre Mis actividades o Monitoreo
            urgente: a?.prioridad === 'urgente',
            count: n.count,
            columna: n.columna, // solicitudes de cambio en el tablero
            at: n.at,
            read: n.read,
          }
        }),
    }
  }))

  app.post('/api/notificaciones/:no/leidas', { schema: porEmpleado }, conEmpleado((u) => {
    notificaciones.filter((n) => n.for === u.no).forEach((n) => (n.read = true))
    return { ok: true }
  }))

  // Borrar el historial: todas las notificaciones propias. Los avisos automáticos no vuelven (cada uno se marca al crearse)
  app.delete('/api/notificaciones/:no', { schema: porEmpleado }, conEmpleado((u) => {
    const antes = notificaciones.length
    for (let i = notificaciones.length - 1; i >= 0; i--) if (notificaciones[i].for === u.no) notificaciones.splice(i, 1)
    return { borradas: antes - notificaciones.length }
  }))

  app.post('/api/notificaciones/:no/:id/leida', { schema: notificacionSchema }, async (req, reply) => {
    const n = notificaciones.find((x) => x.id === req.params.id && x.for === req.params.no)
    if (!n) return reply.code(404).send({ error: 'Notificación no encontrada.' })
    n.read = true
    return { ok: true }
  })

  // Equipo del encargado con sus actividades vigentes: alimenta Registrar, herencia, Monitoreo y Reportes
  app.get('/api/equipo/:no', { schema: conDesde }, conEmpleado((u, req, reply) => {
    if (!esEncargado(u)) return reply.code(403).send({ error: 'Solo los encargados ven a su equipo.' })
    const acts = delTurno(vigentes(), req.query.desde)
    const rate = conRateDe(req.query)
    return asignables(u)
      .sort((a, b) => RANGO[a.role] - RANGO[b.role] || a.name.localeCompare(b.name))
      .map(({ no, name, role, dept, shift, boss }) => ({
        no, name, role, dept, shift, boss, ...rate(no),
        actividades: acts.filter((a) => a.to === no).sort((a, b) => b.id - a.id).map((a) => ({ ...a, byName: empleado(a.by)?.name })),
      }))
  }))

  app.post('/api/actividades', { schema: registrarSchema }, async (req, reply) => {
    const { por, para, fecha, turno, puntos, comentario = '', prioridad, cierre, criticidad = 'normal', recurrencia: periodo } = req.body
    const encargado = empleado(por)
    if (!encargado || !esEncargado(encargado)) {
      return reply.code(403).send({ error: 'Solo los encargados registran actividades.' })
    }
    if (!asignables(encargado).some((e) => e.no === para)) {
      return reply.code(403).send({ error: 'Ese empleado no está a tu cargo.' })
    }
    // Una urgente es para el turno en curso o el siguiente: se cierra dentro de las próximas 24 h
    const espera = Date.parse(cierre) - Date.now()
    if (prioridad === 'urgente' && !(espera > 0 && espera <= DIA)) {
      return reply.code(400).send({ error: 'Una urgente es para el turno en curso o el siguiente: revisa la fecha y el turno.' })
    }
    const at = ahora()
    const nuevas = puntos.map((p) => {
      const a = {
        id: siguienteId(actividades), to: para, by: por, date: fecha, shift: turno, at,
        text: p.texto.trim(), pct: 0, status: 'pending', mgr: comentario.trim(), note: '',
        ...(prioridad === 'urgente' ? { prioridad, cierreTurno: cierre } : { criticidad, ...conRecurrencia(periodo, fecha) }),
      }
      actividades.push(a)
      return a
    })
    notificar({ for: para, kind: 'assigned', who: por, count: nuevas.length })
    return reply.code(201).send(nuevas)
  })

  // El técnico / Ing. Jr agrega una tarea suya: se toman sus datos tal cual (él mismo, su turno, la fecha de hoy)
  app.post('/api/actividades/propia', { schema: propiaSchema }, async (req, reply) => {
    const { por, textos, prioridad, hoy, cierre, criticidad = 'normal', recurrencia: periodo } = req.body
    const u = empleado(por)
    if (!u || esEncargado(u)) return reply.code(403).send({ error: 'Solo técnicos e Ing. Jr agregan tareas propias.' })
    if (!hoyValido(hoy)) return reply.code(400).send({ error: 'Revisa la fecha de tu equipo.' })
    // La urgente se cierra al terminar el turno: debe llegar el cierre y estar dentro de las próximas 24 h
    const espera = Date.parse(cierre) - Date.now()
    if (prioridad === 'urgente' && !(espera > 0 && espera <= DIA)) {
      return reply.code(400).send({ error: 'No se pudo calcular el fin de tu turno.' })
    }
    const at = ahora()
    const nuevas = textos.map((texto) => {
      const a = {
        id: siguienteId(actividades), to: u.no, by: u.no, date: hoy, shift: u.shift, at, text: texto.trim(),
        pct: 0, status: 'pending', mgr: '', note: '',
        propia: true, prioridad, ...(prioridad === 'urgente' ? { cierreTurno: cierre } : { criticidad, ...conRecurrencia(periodo, hoy) }),
      }
      actividades.push(a)
      return a
    })
    if (u.boss) notificar({ for: u.boss, kind: 'propia', who: u.no, ref: nuevas[0].id, count: nuevas.length })
    return reply.code(201).send(nuevas)
  })

  app.get('/api/actividades/:no', { schema: porEmpleado }, conEmpleado((u) =>
    vigentes()
      .filter((a) => a.to === u.no)
      // Primero las urgentes abiertas, las realizadas al final; luego por criticidad y la más nueva primero
      .sort((a, b) => urgenteAbierta(b) - urgenteAbierta(a) || (a.status === 'done') - (b.status === 'done') ||
        PESO_CRITICIDAD[b.criticidad ?? 'normal'] - PESO_CRITICIDAD[a.criticidad ?? 'normal'] || b.id - a.id)
      .map((a) => ({ ...a, byName: empleado(a.by)?.name })),
  ))

  app.patch('/api/actividades/:id', { schema: actualizarSchema }, async (req, reply) => {
    const a = actividades.find((x) => x.id === req.params.id)
    if (!a) return reply.code(404).send({ error: 'Actividad no encontrada.' })
    const { por, estado, nota = a.note } = req.body
    if (a.to !== por) return reply.code(403).send({ error: 'Solo quien tiene asignada la actividad puede actualizarla.' })
    if (a.handedTo) return reply.code(409).send({ error: 'Esta actividad ya fue heredada a otro turno.' })
    if (a.cerrada) return reply.code(409).send({ error: 'Esta tarea urgente se cerró al terminar el turno.' })

    const cambioEstado = estado !== a.status
    const cambioNota = nota.trim() !== a.note
    // doneAt: cuándo quedó realizada; se conserva si ya lo estaba y se borra si se reabre
    Object.assign(a, {
      // pct se deriva del estado (lo leen reportes y datos viejos): Realizada = 100, lo demás 0
      status: estado, pct: estado === 'done' ? 100 : 0, note: nota.trim(),
      doneAt: estado !== 'done' ? undefined : a.status === 'done' ? a.doneAt : ahora(),
    })
    // El encargado se entera del cambio de estado y del comentario por separado, como en el mockup
    if (cambioEstado) notificar({ for: responsable(a), kind: estado, who: por, ref: a.id })
    if (cambioNota) notificar({ for: responsable(a), kind: 'comment', who: por, ref: a.id })
    return { ...a, byName: empleado(a.by)?.name }
  })

  // ── Tablero ──────────────────────────────────────────────────────────────────────────────────────────────
  // El encargado mueve las actividades de su equipo entre columnas de criticidad (o a Urgente), las fija arriba
  // o las elimina. Las columnas son la criticidad: moverla es cambiarla
  const delEquipo = (por, a) => { const yo = empleado(por); return yo && esEncargado(yo) && asignables(yo).some((e) => e.no === a.to) }
  const tableroSchema = {
    params: heredarSchema.params,
    body: objeto(['por'], { por: noEmpleado, columna: { enum: ['nueva', 'simple', 'normal', 'alta', 'critica', 'urgente'] }, fijada: { type: 'boolean' }, cierre: { type: 'string', format: 'date-time' } }),
  }
  // Cambia la columna (la criticidad, o Urgente). Devuelve [código, error] si no se puede
  function aColumna(a, columna, cierre, por) {
    if (a.cerrada) return [409, 'Esta tarea urgente se cerró al terminar el turno.']
    if (columna === 'urgente') {
      // Igual que al asignar una urgente: se cierra al terminar su turno, dentro de las próximas 24 h
      const espera = Date.parse(cierre) - Date.now()
      if (a.status === 'done') return [409, 'Una actividad realizada no se marca como urgente.']
      if (!(espera > 0 && espera <= DIA)) return [400, 'Una urgente es para el turno en curso o el siguiente: revisa la fecha y el turno.']
      if (a.prioridad !== 'urgente' && a.to !== por) notificar({ for: a.to, kind: 'urgente', who: por, ref: a.id })
      Object.assign(a, { prioridad: 'urgente', cierreTurno: cierre })
      delete a.criticidad
      // Una urgente es para un solo turno: deja de repetirse (su copia nacería sin cierre)
      delete a.recurrencia
      delete a.diaMes
    } else {
      delete a.prioridad
      delete a.cierreTurno
      a.criticidad = columna
    }
    delete a.solicitud // el encargado ya decidió dónde va
  }
  app.patch('/api/actividades/:id/tablero', { schema: tableroSchema }, async (req, reply) => {
    const a = vigentes().find((x) => x.id === req.params.id)
    if (!a) return reply.code(404).send({ error: 'Actividad no encontrada.' })
    const { por, columna, fijada, cierre } = req.body
    // El técnico / Ing. Jr no mueve sus tarjetas: pide el cambio y lo valida su encargado
    if (a.to === por && !delEquipo(por, a)) {
      if (!columna || fijada !== undefined) return reply.code(403).send({ error: 'Solo tu encargado fija o elimina actividades.' })
      if (a.cerrada) return reply.code(409).send({ error: 'Esta tarea urgente se cerró al terminar el turno.' })
      a.solicitud = { columna, ...(columna === 'urgente' && { cierre }), at: ahora() }
      notificar({ for: responsable(a), kind: 'solicitud', who: por, ref: a.id, columna })
      return reply.code(202).send(a)
    }
    if (!delEquipo(por, a)) return reply.code(403).send({ error: 'Esa actividad no es de tu equipo.' })
    if (columna) {
      const fallo = aColumna(a, columna, cierre, por)
      if (fallo) return reply.code(fallo[0]).send({ error: fallo[1] })
    }
    if (fijada !== undefined) a.fijada = fijada
    return a
  })
  // El encargado aprueba (se mueve a donde se pidió) o rechaza la solicitud; se avisa a quien la pidió
  app.post('/api/actividades/:id/solicitud', { schema: { params: heredarSchema.params, body: objeto(['por', 'aprobar'], { por: noEmpleado, aprobar: { type: 'boolean' } }) } }, async (req, reply) => {
    const a = vigentes().find((x) => x.id === req.params.id)
    const { por, aprobar } = req.body
    if (!a?.solicitud) return reply.code(404).send({ error: 'Esa solicitud ya no está pendiente.' })
    if (!delEquipo(por, a)) return reply.code(403).send({ error: 'Esa actividad no es de tu equipo.' })
    const { columna, cierre } = a.solicitud
    if (aprobar) {
      const fallo = aColumna(a, columna, cierre, por)
      if (fallo) return reply.code(fallo[0]).send({ error: fallo[1] })
    } else delete a.solicitud
    notificar({ for: a.to, kind: aprobar ? 'solicitud-ok' : 'solicitud-no', who: por, ref: a.id, columna })
    return a
  })
  app.delete('/api/actividades/:id', { schema: { params: heredarSchema.params, body: objeto(['por'], { por: noEmpleado }) } }, async (req, reply) => {
    const i = actividades.findIndex((x) => x.id === req.params.id && !x.handedTo)
    if (i < 0) return reply.code(404).send({ error: 'Actividad no encontrada.' })
    if (!delEquipo(req.body.por, actividades[i])) return reply.code(403).send({ error: 'Esa actividad no es de tu equipo.' })
    if (actividades[i].herencia) return reply.code(409).send({ error: 'Tiene una herencia esperando validación.' })
    // Se borra; las herencias ya resueltas la conservan en su historial por la original, no por esta
    actividades.splice(i, 1)
    return { ok: true }
  })

  // Editar: el encargado cambia texto, comentario, fecha, turno y recurrencia de las de su equipo; el técnico /
  // Ing. Jr, texto, fecha y recurrencia de las que agregó él. Se avisa al otro
  app.patch('/api/actividades/:id/editar', { schema: editarSchema }, async (req, reply) => {
    const a = vigentes().find((x) => x.id === req.params.id)
    if (!a) return reply.code(404).send({ error: 'Actividad no encontrada.' })
    const { por, texto, comentario, fecha, turno, recurrencia: periodo } = req.body
    const encargado = delEquipo(por, a)
    if (!encargado && !(a.propia && a.to === por)) return reply.code(403).send({ error: 'Solo tu encargado edita esta actividad.' })
    if (!encargado && (comentario !== undefined || turno !== undefined)) return reply.code(403).send({ error: 'El comentario y el turno los cambia tu encargado.' })
    if (a.cerrada) return reply.code(409).send({ error: 'Esta tarea urgente se cerró al terminar el turno.' })
    if (periodo && periodo !== 'no' && a.prioridad === 'urgente') return reply.code(400).send({ error: 'Una urgente no se repite: es para un solo turno.' })
    if (texto !== undefined) a.text = texto.trim()
    if (comentario !== undefined) a.mgr = comentario.trim()
    if (fecha) a.date = fecha
    if (turno) a.shift = turno
    if (periodo) {
      delete a.recurrencia
      delete a.diaMes
      if (periodo !== 'no') Object.assign(a, conRecurrencia(periodo, a.date))
    } else if (fecha && a.recurrencia === 'mensual') a.diaMes = Number(fecha.slice(8))
    const otro = encargado ? a.to : responsable(a)
    if (otro && otro !== por) notificar({ for: otro, kind: 'editada', who: por, ref: a.id })
    return a
  })

  // ── Tareas guardadas ─────────────────────────────────────────────────────────────────────────────────────
  // Plantillas personales: cada quien guarda las que repite (texto, criticidad, comentario y recurrencia) y
  // las usa al crear en el Tablero. Mismo texto = se actualiza la que ya estaba
  const MAX_GUARDADAS = 100
  app.get('/api/guardadas/:no', { schema: porEmpleado }, conEmpleado((u) =>
    guardadas.filter((g) => g.no === u.no)
      .sort((x, y) => PESO_CRITICIDAD[y.criticidad] - PESO_CRITICIDAD[x.criticidad] || x.texto.localeCompare(y.texto))))
  app.post('/api/guardadas', { schema: guardadaSchema }, async (req, reply) => {
    const { por, texto, criticidad, comentario = '', recurrencia: periodo } = req.body
    const datos = { texto: texto.trim(), criticidad, comentario: comentario.trim(), ...(periodo && { recurrencia: periodo }) }
    const igual = guardadas.find((g) => g.no === por && g.texto.toLowerCase() === datos.texto.toLowerCase())
    if (igual) {
      delete igual.recurrencia
      return Object.assign(igual, datos)
    }
    if (guardadas.filter((g) => g.no === por).length >= MAX_GUARDADAS) return reply.code(409).send({ error: 'Tienes 100 tareas guardadas: elimina alguna para guardar otra.' })
    const g = { id: siguienteId(guardadas), no: por, ...datos, at: ahora() }
    guardadas.push(g)
    return reply.code(201).send(g)
  })
  app.delete('/api/guardadas/:id', { schema: { params: heredarSchema.params, body: objeto(['por'], { por: noEmpleado }) } }, async (req, reply) => {
    const i = guardadas.findIndex((g) => g.id === req.params.id && g.no === req.body.por)
    if (i < 0) return reply.code(404).send({ error: 'Tarea guardada no encontrada.' })
    guardadas.splice(i, 1)
    return { ok: true }
  })

  // ── Herencia ─────────────────────────────────────────────────────────────────────────────────────────────
  // Un encargado (Ing. Full o superior) propone heredar una actividad pendiente o incompleta de su equipo, con
  // motivo, a alguien de cualquier departamento. La valida el encargado directo de quien la recibe: acepta,
  // rechaza o redirige a alguien de su equipo. Si quien propone ya es ese encargado, entra directo.
  // Límites por día (fecha local de quien actúa): 2 herencias por turno y 2 a otro departamento a quien propone,
  // 2 redirecciones a quien valida. La crítica pasa directo al siguiente turno una vez al día, sin límite.
  const LIMITE = 2
  const NIVEL = { tec: 'ejecutor', jr: 'ejecutor', full: 'lider', sr: 'lider', gte: 'lider' }
  // Verificación de quien recibe: cada condición es un sí/no y todas deben cumplirse
  const condiciones = (a, r) => ({
    puesto: NIVEL[r.role] === NIVEL[empleado(a.to).role], // técnico ↔ Ing. Jr, Ing. Full ↔ Senior
    turno: r.no === a.to || r.shift === SIGUIENTE_TURNO[a.shift], // el mismo empleado (día siguiente) u otro del turno siguiente
  })
  const puedeRecibir = (a, r) => Object.values(condiciones(a, r)).every(Boolean)
  const validadorDe = (r) => r.boss ?? r.no
  const cuenta = (filtro) => herencias.filter((h) => h.estado !== 'rechazada' && h.estado !== 'anulada' && filtro(h)).length
  const heredable = (a) => a.prioridad !== 'urgente' && !a.handedTo && (a.status === 'pending' || a.status === 'incomplete')

  // La actividad pasa a quien recibe. Mismo empleado: día siguiente, mismo turno. Otro: siguiente turno (tras el C
  // viene el A del día siguiente). Se cuenta desde hoy si es de días anteriores, para no crearla en el pasado
  const traspasar = (a, para, por, hoy) => {
    const mismo = para === a.to
    const base = a.date > hoy ? a.date : hoy
    const nueva = {
      ...a, id: siguienteId(actividades), to: para, by: por, at: ahora(), status: 'pending', note: '', inh: true,
      date: mismo || a.shift === 'C' ? diaSiguiente(base) : base,
      shift: mismo ? a.shift : SIGUIENTE_TURNO[a.shift],
      ...(a.criticidad === 'critica' && { pasadaEl: hoy }),
    }
    delete nueva.herencia
    // La recurrencia se queda con su dueño: la heredada es una sola vez
    delete nueva.recurrencia
    delete nueva.diaMes
    actividades.push(nueva)
    a.handedTo = para
    delete a.herencia
    notificar({ for: para, kind: 'inherited', who: por, ref: nueva.id })
    return nueva
  }
  const vistaHerencia = (h) => {
    const a = actividades.find((x) => x.id === h.act)
    const nombre = (no) => empleado(no)?.name
    const persona = (no) => { const e = empleado(no); return e && { no, name: e.name, role: e.role, dept: e.dept, shift: e.shift } }
    return {
      ...h, de: persona(a.to), porName: nombre(h.por), validaName: nombre(h.valida),
      paraPersona: persona(h.para), redirigidaName: nombre(h.redirigidaA),
      actividad: { id: a.id, text: a.text, date: a.date, shift: a.shift, pct: a.pct, status: a.status, criticidad: a.criticidad ?? 'normal' },
    }
  }

  // Quiénes pueden recibir esta actividad (cualquier departamento), y quién validaría
  app.get('/api/actividades/:id/receptores', { schema: { params: heredarSchema.params } }, async (req, reply) => {
    const a = actividades.find((x) => x.id === req.params.id)
    const yo = empleado(req.sesion.no)
    if (!a || !esEncargado(yo) || !asignables(yo).some((e) => e.no === a.to)) {
      return reply.code(403).send({ error: 'Esa actividad no es de tu equipo.' })
    }
    return usuarios.filter((r) => puedeRecibir(a, r))
      .sort((x, y) => (x.no !== a.to) - (y.no !== a.to) || (x.dept !== yo.dept) - (y.dept !== yo.dept) || x.name.localeCompare(y.name))
      .map((r) => ({
        no: r.no, name: r.name, role: r.role, dept: r.dept, shift: r.shift, mismo: r.no === a.to,
        // null: entra directo (crítica, o quien propone ya es su encargado)
        valida: a.criticidad === 'critica' || validadorDe(r) === yo.no ? null : empleado(validadorDe(r))?.name,
      }))
  })

  app.post('/api/actividades/:id/heredar', { schema: heredarSchema }, async (req, reply) => {
    const a = actividades.find((x) => x.id === req.params.id)
    if (!a) return reply.code(404).send({ error: 'Actividad no encontrada.' })
    const { por, para, hoy, motivo } = req.body
    const yo = empleado(por)
    if (!yo || !esEncargado(yo) || !asignables(yo).some((e) => e.no === a.to)) {
      return reply.code(403).send({ error: 'Esa actividad no es de tu equipo.' })
    }
    if (!hoyValido(hoy)) return reply.code(400).send({ error: 'Revisa la fecha de tu equipo.' })
    if (a.prioridad === 'urgente') return reply.code(409).send({ error: 'Las tareas urgentes no se heredan.' })
    if (!heredable(a)) return reply.code(409).send({ error: 'Solo se heredan actividades pendientes o incompletas, una sola vez.' })
    if (a.herencia) return reply.code(409).send({ error: 'Esa actividad ya espera validación.' })
    const r = empleado(para)
    if (!r) return reply.code(404).send({ error: 'Empleado no encontrado.' })
    const ok = condiciones(a, r)
    if (!ok.puesto) return reply.code(400).send({ error: 'Solo se hereda entre puestos del mismo nivel: técnico e Ing. Jr, o Ing. Full y Senior.' })
    if (!ok.turno) return reply.code(400).send({ error: 'Quien recibe debe ser del turno siguiente (o el mismo empleado, al día siguiente).' })

    const critica = a.criticidad === 'critica'
    const cruzada = r.dept !== empleado(a.to).dept
    if (critica && a.pasadaEl === hoy) return reply.code(409).send({ error: 'Una actividad crítica pasa de turno una sola vez al día.' })
    if (!critica) {
      if (cuenta((h) => h.por === por && h.hoy === hoy && h.turno === a.shift && !h.critica) >= LIMITE) {
        return reply.code(409).send({ error: 'Ya heredaste 2 actividades de ese turno hoy.' })
      }
      if (cruzada && cuenta((h) => h.por === por && h.hoy === hoy && h.cruzada && !h.critica) >= LIMITE) {
        return reply.code(409).send({ error: 'Ya heredaste 2 actividades a otro departamento hoy.' })
      }
    }
    const valida = validadorDe(r)
    const directa = critica || valida === por
    const h = {
      id: siguienteId(herencias), act: a.id, por, para, motivo: motivo.trim(), hoy, turno: a.shift, cruzada, critica, valida,
      estado: directa ? 'aceptada' : 'pendiente', at: ahora(),
    }
    herencias.push(h)
    let creada
    if (directa) h.nueva = (creada = traspasar(a, para, por, hoy)).id
    else {
      a.herencia = h.id
      notificar({ for: valida, kind: 'herencia-pendiente', who: por, ref: a.id })
    }
    // creada: la actividad que ya recibió (fecha y turno), si entró directo
    return reply.code(201).send({ ...vistaHerencia(h), creada })
  })

  // Lo que el encargado tiene por validar, lo que propuso y cuánto le queda hoy de cada límite
  app.get('/api/herencias/:no', { schema: { ...porEmpleado, querystring: objeto(['hoy'], { hoy: { type: 'string', format: 'date' } }) } },
    conEmpleado((u, req, reply) => {
      if (!esEncargado(u)) return reply.code(403).send({ error: 'Solo los encargados heredan actividades.' })
      const { hoy } = req.query
      const equipoDe = [u, ...equipo(u.no)]
      return {
        limite: LIMITE,
        usadas: {
          turnos: Object.fromEntries(['A', 'B', 'C'].map((t) => [t, cuenta((h) => h.por === u.no && h.hoy === hoy && h.turno === t && !h.critica)])),
          cruzadas: cuenta((h) => h.por === u.no && h.hoy === hoy && h.cruzada && !h.critica),
          redirecciones: herencias.filter((h) => h.resueltaPor === u.no && h.resueltaHoy === hoy && h.estado === 'redirigida').length,
        },
        porValidar: herencias.filter((h) => h.valida === u.no && h.estado === 'pendiente').map((h) => {
          const a = actividades.find((x) => x.id === h.act)
          // A quién más de su equipo se puede redirigir
          const opciones = equipoDe.filter((e) => e.no !== h.para && puedeRecibir(a, e))
            .map(({ no, name, role, shift }) => ({ no, name, role, shift }))
          return { ...vistaHerencia(h), opciones }
        }),
        enviadas: herencias.filter((h) => h.por === u.no && actividades.some((a) => a.id === h.act)).slice(-20).reverse().map(vistaHerencia),
      }
    }))

  app.post('/api/herencias/:id/responder', { schema: responderSchema }, async (req, reply) => {
    const h = herencias.find((x) => x.id === req.params.id)
    if (!h) return reply.code(404).send({ error: 'Herencia no encontrada.' })
    const { por, accion, comentario: nota = '', para, hoy } = req.body
    if (h.valida !== por) return reply.code(403).send({ error: 'Solo valida el encargado de quien la recibe.' })
    if (h.estado !== 'pendiente') return reply.code(409).send({ error: 'Esa herencia ya se resolvió.' })
    if (!hoyValido(hoy)) return reply.code(400).send({ error: 'Revisa la fecha de tu equipo.' })
    if (accion !== 'aceptar' && !nota.trim()) return reply.code(400).send({ error: 'Escribe el motivo.' })
    const a = actividades.find((x) => x.id === h.act)
    const resolver = (estado) => {
      Object.assign(h, { estado, respuesta: nota.trim(), resueltaPor: por, resueltaHoy: hoy, resueltaAt: ahora() })
      delete a.herencia
      notificar({ for: h.por, kind: `herencia-${estado}`, who: por, ref: a.id })
    }
    if (accion === 'rechazar') {
      resolver('rechazada')
      return vistaHerencia(h)
    }
    // Mientras esperaba, el ejecutor pudo terminarla
    if (!heredable(a)) {
      resolver('anulada')
      return reply.code(409).send({ error: 'La actividad ya no está pendiente: se anuló la herencia.' })
    }
    let destino = h.para
    if (accion === 'redirigir') {
      const r = empleado(para)
      if (!r || r.no === h.para || (r.no !== por && !equipo(por).some((e) => e.no === r.no)) || !puedeRecibir(a, r)) {
        return reply.code(400).send({ error: 'Redirige a alguien de tu equipo, del mismo nivel de puesto y del turno siguiente.' })
      }
      const usadas = herencias.filter((x) => x.resueltaPor === por && x.resueltaHoy === hoy && x.estado === 'redirigida').length
      if (usadas >= LIMITE) return reply.code(409).send({ error: 'Ya redirigiste 2 actividades hoy.' })
      destino = r.no
      h.redirigidaA = r.no
    }
    const creada = traspasar(a, destino, h.por, hoy)
    h.nueva = creada.id
    resolver(accion === 'redirigir' ? 'redirigida' : 'aceptada')
    return { ...vistaHerencia(h), creada }
  })


  app.post('/api/reportes', { schema: reporteSchema }, async (req, reply) => {
    const { por, empleados, desde, hasta, turno } = req.body
    const encargado = empleado(por)
    if (!encargado || !esEncargado(encargado)) return reply.code(403).send({ error: 'Solo los encargados generan reportes.' })
    const permitidos = [por, ...equipo(por).map((e) => e.no)]
    if (!empleados.every((no) => permitidos.includes(no))) {
      return reply.code(403).send({ error: 'Solo puedes consultar a tu equipo.' })
    }
    // Incluye las heredadas: el reporte es el historial completo
    return actividades
      .filter((a) => empleados.includes(a.to) && a.date >= desde && a.date <= hasta && (!turno || a.shift === turno))
      .sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at))
      .map((a) => {
        const e = empleado(a.to)
        return {
          id: a.id, date: a.date, shift: a.shift, at: a.at, text: a.text, pct: a.pct, status: a.status, note: a.note,
          mgr: a.mgr, inh: !!a.inh, heredadaA: a.handedTo && empleado(a.handedTo).name, prioridad: a.prioridad, criticidad: a.criticidad, cerrada: !!a.cerrada,
          no: a.to, doneAt: a.doneAt ?? (a.status === 'done' ? a.at : undefined), // para el comparativo
          name: e.name, role: e.role, dept: e.dept,
        }
      })
  })

  // Matriz de seguimiento del equipo entre dos fechas (hasta hoy):
  // - yield de diarias y de urgentes: realizadas ÷ las que cuentan. Las de hoy abiertas y las urgentes aún sin
  //   cerrar no cuentan todavía; una heredada cuenta una vez, en quien la recibió
  // - tiempo extra (minutos) y asistencia según el checador, hasta ayer (la salida de hoy aún no ocurre)
  app.get('/api/matriz/:no', { schema: matrizSchema }, conEmpleado((u, req, reply) => {
    if (!esEncargado(u)) return reply.code(403).send({ error: 'Solo los encargados ven a su equipo.' })
    const { desde, hoy } = req.query
    if (!hoyValido(hoy)) return reply.code(400).send({ error: 'Revisa la fecha de tu equipo.' })
    const hasta = req.query.hasta < hoy ? req.query.hasta : hoy
    if (desde > hasta || sumarDias(desde, 366) < hasta) return reply.code(400).send({ error: 'Elige un periodo de hasta un año, sin fechas futuras.' })
    const hastaAyer = hasta < hoy ? hasta : sumarDias(hoy, -1)
    let habiles = 0
    for (let d = desde; d <= hastaAyer; d = diaSiguiente(d)) habiles += diaHabil(d)
    const periodo = vigentes().filter((a) => a.date >= desde && a.date <= hasta)
    const yieldDe = (acts) => [acts.filter((a) => a.status === 'done').length, acts.length]
    return equipo(u.no)
      .sort((a, b) => RANGO[a.role] - RANGO[b.role] || a.name.localeCompare(b.name))
      .map(({ no, name, role, shift, boss }) => {
        const suyas = periodo.filter((a) => a.to === no)
        const marcas = checador.filter((r) => r.no === no && r.date >= desde && r.date <= hastaAyer)
        return {
          no, name, role, shift, boss,
          diarias: yieldDe(suyas.filter((a) => a.prioridad !== 'urgente' && (a.status === 'done' || a.date < hoy))),
          urgentes: yieldDe(suyas.filter((a) => a.prioridad === 'urgente' && (a.status === 'done' || a.cerrada))),
          extra: marcas.reduce((s, r) => s + tiempoExtra(r, shift), 0),
          asistencia: [marcas.filter((r) => diaHabil(r.date)).length, habiles],
        }
      })
  }))

  // ── Super administrador ──────────────────────────────────────────────────────────────────────────────────
  // Todo /api/admin/ exige sesión de super administrador (preHandler). Los cambios piden además volver a
  // escribir su contraseña: vale 5 minutos; 5 intentos fallidos cierran su sesión
  const CONFIRMACION = 5 * 60_000
  const confirmado = (req, reply) => {
    if (req.sesion.confirmado > Date.now()) return true
    reply.code(403).send({ error: 'Confirma tu contraseña para continuar.', confirmar: true })
    return false
  }
  app.post('/api/admin/confirmar', { schema: confirmarSchema }, async (req, reply) => {
    const yo = empleado(req.sesion.no)
    if (!(await passwordCorrecta(yo.password, req.body.password))) {
      registrar(req, 'admin-confirmacion-fallida', { no: yo.no, ok: false })
      req.sesion.fallos = (req.sesion.fallos ?? 0) + 1
      if (req.sesion.fallos >= 5) {
        sesiones.delete(tokenDe(req))
        return reply.code(401).send({ error: 'Tu sesión terminó. Vuelve a iniciar sesión.', sesion: false })
      }
      return reply.code(401).send({ error: 'La contraseña no es correcta.' })
    }
    Object.assign(req.sesion, { confirmado: Date.now() + CONFIRMACION, fallos: 0 })
    registrar(req, 'admin-confirmacion', { no: yo.no })
    return { hasta: new Date(req.sesion.confirmado).toISOString() }
  })

  const ultimoAcceso = (no) => registros.findLast((r) => r.no === no && r.evento === 'login')?.at ?? null
  const vistaUsuario = (u) => ({
    no: u.no, name: u.name, email: u.email, role: u.role, dept: u.dept, shift: u.shift, area: u.area,
    boss: u.boss, bossName: empleado(u.boss)?.name, activo: u.activo !== false, prueba: !!u.prueba, mfa: !!u.totp,
    sinPassword: !u.password, debeCambiar: !!u.debeCambiar, pwdChanged: u.pwdChanged, diasPassword: diasPassword(u),
    ultimoAcceso: ultimoAcceso(u.no),
  })
  app.get('/api/admin/usuarios', async () =>
    usuarios.map(vistaUsuario).sort((a, b) => (a.role === 'sa') - (b.role === 'sa') || a.name.localeCompare(b.name)))

  // Quién recibe el cambio: existe y no es super administrador (esas cuentas se manejan en el servidor)
  const destino = (req, reply) => {
    const u = empleado(req.params.empleado)
    if (!u) { reply.code(404).send({ error: 'Empleado no encontrado.' }); return null }
    if (esSA(u)) { reply.code(403).send({ error: 'Las cuentas de super administrador se manejan en el servidor.' }); return null }
    return u
  }
  const cerrarSesionesDe = (no) => sesiones.forEach((s, token) => s.no === no && sesiones.delete(token))

  app.patch('/api/admin/usuarios/:empleado', { schema: editarUsuarioSchema }, async (req, reply) => {
    if (!confirmado(req, reply)) return
    const u = destino(req, reply)
    if (!u) return
    const { shift, role, activo } = req.body
    if (role && role !== u.role) {
      // Igual que la plantilla: su encargado de mayor puesto y su gente de menor, para que la jerarquía no haga ciclos
      const jefe = empleado(u.boss)
      if (jefe && !(RANGO[jefe.role] < RANGO[role])) return reply.code(400).send({ error: 'Su encargado debe ser de mayor puesto: cambia primero a su encargado.' })
      if (usuarios.some((x) => x.boss === u.no && RANGO[x.role] <= RANGO[role])) {
        return reply.code(400).send({ error: 'Tiene a su cargo personas de igual o mayor puesto: cámbialas primero.' })
      }
    }
    const cambios = Object.entries({ shift, role, activo }).filter(([k, v]) => v !== undefined && v !== (k === 'activo' ? u.activo !== false : u[k]))
    if (!cambios.length) return vistaUsuario(u)
    for (const [k, v] of cambios) u[k] = v
    if (activo === false) cerrarSesionesDe(u.no) // sin acceso: fuera de inmediato
    registrar(req, 'admin-usuario', { no: u.no, por: req.sesion.no, detalle: cambios.map(([k, v]) => `${k}=${v}`).join(', ') })
    return vistaUsuario(u)
  })

  // Contraseña temporal: se muestra una sola vez, cierra sus sesiones y al entrar debe cambiarla
  app.post('/api/admin/usuarios/:empleado/password', { schema: accionAdminSchema }, async (req, reply) => {
    if (!confirmado(req, reply)) return
    const u = destino(req, reply)
    if (!u) return
    const temporal = passwordTemporal()
    Object.assign(u, { password: await hashPassword(temporal), pwdChanged: ahora(), debeCambiar: true })
    cerrarSesionesDe(u.no)
    registrar(req, 'admin-password', { no: u.no, por: req.sesion.no })
    return { temporal }
  })

  // Reiniciar MFA (perdió el teléfono): en su próximo login vuelve a vincular la app
  app.post('/api/admin/usuarios/:empleado/mfa', { schema: accionAdminSchema }, async (req, reply) => {
    if (!confirmado(req, reply)) return
    const u = destino(req, reply)
    if (!u) return
    delete u.totp
    delete u.totpPaso
    cerrarSesionesDe(u.no)
    registrar(req, 'admin-mfa', { no: u.no, por: req.sesion.no })
    return vistaUsuario(u)
  })

  // Respaldo descargable de toda la base (sin sesiones). Trae contraseñas cifradas y secretos del MFA: pide confirmar
  // y queda registrado. Se restaura con npm run restaurar -- archivo.json
  app.post('/api/admin/respaldo', async (req, reply) => {
    if (!confirmado(req, reply)) return
    registrar(req, 'admin-respaldo', { por: req.sesion.no })
    return respaldo(app.estado)
  })

  // Registros: solo lectura, del más nuevo al más viejo. q busca en número, nombre, usuario escrito, IP y detalle
  app.get('/api/admin/registros', { schema: registrosSchema }, async (req) => {
    const { q, evento, desde, hasta } = req.query
    const texto = q?.trim().toLowerCase()
    return registros.filter((r) => {
      const dia = r.at.slice(0, 10)
      if ((evento && r.evento !== evento) || (desde && dia < desde) || (hasta && dia > hasta)) return false
      return !texto || [r.no, empleado(r.no)?.name, r.usuario, r.ip, r.detalle, empleado(r.por)?.name].some((v) => v?.toLowerCase().includes(texto))
    }).slice(-1000).reverse().map((r) => ({ ...r, name: empleado(r.no)?.name, porName: empleado(r.por)?.name }))
  })

  // Borrar los anteriores a una fecha (no sueltos: un registro de auditoría no se edita). El borrado queda registrado
  app.post('/api/admin/registros/purgar', { schema: purgarSchema }, async (req, reply) => {
    if (!confirmado(req, reply)) return
    const antes = registros.length
    for (let i = registros.length - 1; i >= 0; i--) if (registros[i].at.slice(0, 10) < req.body.antes) registros.splice(i, 1)
    const borrados = antes - registros.length
    registrar(req, 'registros-purgados', { no: req.sesion.no, por: req.sesion.no, detalle: `${borrados} anteriores a ${req.body.antes}` })
    return { borrados }
  })

  // Lo que se guarda en PostgreSQL (server/db.js)
  app.decorate('estado', { usuarios, actividades, notificaciones, herencias, guardadas, departamentos, checador, registros, sesiones, ultimosIds })

  if (existsSync(dist)) {
    app.register(fastifyStatic, {
      root: dist,
      preCompressed: true, // .br / .gz de scripts/comprimir.js (npm run build)
      // Los archivos de /assets llevan un hash en el nombre: nunca cambian, el navegador puede guardarlos para siempre
      setHeaders: (reply, ruta) => {
        if (ruta.includes('/assets/')) reply.header('cache-control', 'public, max-age=31536000, immutable')
      },
    })
  }

  return app
}
