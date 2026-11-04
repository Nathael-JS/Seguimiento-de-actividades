import pg from 'pg'

// PostgreSQL (Neon en producción). La app trabaja con los datos en memoria y aquí se guardan: al arrancar se
// cargan todos y, después de cada petición, se escribe solo lo que cambió (en una transacción) antes de responder.
// shortcut: una sola instancia del servidor; con varias, cada una tendría su copia en memoria. Al escalar, pasar
// las consultas a SQL por petición

// Fechas AAAA-MM-DD y marcas de tiempo tal como las usa la app (texto e ISO), no objetos Date
pg.types.setTypeParser(1082, (v) => v)
pg.types.setTypeParser(1184, (v) => new Date(v).toISOString())
pg.types.setTypeParser(20, Number) // bigint: milisegundos y pasos del TOTP caben de sobra en un número

// Cada tabla: llave primaria y columnas [columna, propiedad en la app, tipo]. Lo que no tenga columna va en
// "extra" (jsonb), así ningún dato se pierde aunque la app agregue campos nuevos
const TABLAS = {
  departamentos: { pk: ['clave'], cols: [['clave', 'clave', 'text'], ['nombre', 'nombre', 'text not null'], ['gerente', 'gerente', 'text']] },
  usuarios: {
    pk: ['no'],
    cols: [
      ['no', 'no', 'text'], ['nombre', 'name', 'text not null'], ['correo', 'email', 'text not null unique'], ['puesto', 'role', 'text not null'],
      ['departamento', 'dept', 'text'], ['encargado', 'boss', 'text'], ['turno', 'shift', 'text'], ['area', 'area', 'text'],
      ['password', 'password', 'text'], ['password_cambiada', 'pwdChanged', 'timestamptz'], ['totp', 'totp', 'text'], ['totp_paso', 'totpPaso', 'bigint'],
      ['activo', 'activo', 'boolean'], ['prueba', 'prueba', 'boolean'], ['debe_cambiar', 'debeCambiar', 'boolean'], ['aviso_password', 'avisoPassword', 'text'],
    ],
  },
  actividades: {
    pk: ['id'],
    cols: [
      ['id', 'id', 'integer'], ['para', 'to', 'text not null'], ['por', 'by', 'text not null'], ['fecha', 'date', 'date not null'],
      ['turno', 'shift', 'text not null'], ['creada', 'at', 'timestamptz not null'], ['texto', 'text', 'text not null'], ['estado', 'status', 'text not null'],
      ['avance', 'pct', 'integer'], ['comentario_encargado', 'mgr', 'text'], ['comentario', 'note', 'text'], ['realizada', 'doneAt', 'timestamptz'],
      ['prioridad', 'prioridad', 'text'], ['criticidad', 'criticidad', 'text'], ['cierre_turno', 'cierreTurno', 'timestamptz'], ['cerrada', 'cerrada', 'boolean'],
      ['propia', 'propia', 'boolean'], ['heredada', 'inh', 'boolean'], ['heredada_a', 'handedTo', 'text'], ['herencia', 'herencia', 'integer'],
      ['fijada', 'fijada', 'boolean'], ['pasada_el', 'pasadaEl', 'date'], ['aviso_atraso', 'avisoAtraso', 'boolean'],
    ],
  },
  notificaciones: {
    pk: ['id'],
    cols: [
      ['id', 'id', 'integer'], ['para', 'for', 'text not null'], ['tipo', 'kind', 'text not null'], ['quien', 'who', 'text'], ['actividad', 'ref', 'integer'],
      ['cantidad', 'count', 'integer'], ['creada', 'at', 'timestamptz not null'], ['leida', 'read', 'boolean'],
    ],
  },
  herencias: {
    pk: ['id'],
    cols: [
      ['id', 'id', 'integer'], ['actividad', 'act', 'integer not null'], ['por', 'por', 'text not null'], ['para', 'para', 'text not null'],
      ['motivo', 'motivo', 'text'], ['hoy', 'hoy', 'date'], ['turno', 'turno', 'text'], ['cruzada', 'cruzada', 'boolean'], ['critica', 'critica', 'boolean'],
      ['valida', 'valida', 'text'], ['estado', 'estado', 'text not null'], ['creada', 'at', 'timestamptz'], ['respuesta', 'respuesta', 'text'],
      ['resuelta_por', 'resueltaPor', 'text'], ['resuelta_hoy', 'resueltaHoy', 'date'], ['resuelta', 'resueltaAt', 'timestamptz'],
      ['redirigida_a', 'redirigidaA', 'text'], ['nueva', 'nueva', 'integer'],
    ],
  },
  sesiones: {
    pk: ['token'],
    cols: [['token', 'token', 'text'], ['no', 'no', 'text not null'], ['vence', 'vence', 'bigint not null'], ['confirmado', 'confirmado', 'bigint'], ['fallos', 'fallos', 'integer']],
  },
  registros: {
    pk: ['id'],
    cols: [
      ['id', 'id', 'integer'], ['creado', 'at', 'timestamptz not null'], ['evento', 'evento', 'text not null'], ['no', 'no', 'text'], ['usuario', 'usuario', 'text'],
      ['ip', 'ip', 'text'], ['agente', 'agente', 'text'], ['ok', 'ok', 'boolean'], ['detalle', 'detalle', 'text'], ['por', 'por', 'text'],
    ],
  },
  checador: { pk: ['no', 'fecha'], cols: [['no', 'no', 'text'], ['fecha', 'date', 'date'], ['entrada', 'entrada', 'text not null'], ['salida', 'salida', 'text not null']] },
  // Último número entregado de cada lista: no se repite aunque se borre el último (ver siguienteId en app.js)
  ids: { pk: ['lista'], cols: [['lista', 'lista', 'text'], ['ultimo', 'ultimo', 'integer not null']] },
}
const CON_ID = ['actividades', 'notificaciones', 'herencias']

const conocidas = (t) => new Set(TABLAS[t].cols.map(([, p]) => p))
const aFila = (t, obj) => {
  const extra = Object.fromEntries(Object.entries(obj).filter(([k, v]) => !conocidas(t).has(k) && v !== undefined))
  return [...TABLAS[t].cols.map(([, p]) => obj[p] ?? null), Object.keys(extra).length ? extra : null]
}
const deFila = (t, fila) => {
  const obj = {}
  for (const [c, p] of TABLAS[t].cols) if (fila[c] !== null) obj[p] = fila[c]
  return Object.assign(obj, fila.extra)
}
const llave = (t, obj) => TABLAS[t].pk.map((c) => obj[TABLAS[t].cols.find((x) => x[0] === c)[1]]).join('|')

// Filas de cada tabla a partir del estado en memoria
function filasDe(estado) {
  return {
    departamentos: estado.departamentos,
    usuarios: estado.usuarios,
    actividades: estado.actividades,
    notificaciones: estado.notificaciones,
    herencias: estado.herencias,
    sesiones: [...estado.sesiones].map(([token, s]) => ({ token, ...s })),
    registros: estado.registros,
    checador: estado.checador,
    ids: CON_ID.flatMap((lista) => (estado.ultimosIds.has(estado[lista]) ? [{ lista, ultimo: estado.ultimosIds.get(estado[lista]) }] : [])),
  }
}

export async function conectar(url) {
  const pool = new pg.Pool({ connectionString: url, max: 4 })
  // Las tablas se crean si no existen (primer arranque en una base vacía)
  for (const [t, { pk, cols }] of Object.entries(TABLAS)) {
    await pool.query(`create table if not exists ${t} (${cols.map(([c, , tipo]) => `${c} ${tipo}`).join(', ')}, extra jsonb, primary key (${pk.join(', ')}))`)
  }
  return pool
}

// Carga todo; la primera vez (sin usuarios) devuelve null para que la app arranque con los datos de prueba
export async function cargar(pool) {
  const datos = {}
  for (const t of Object.keys(TABLAS)) {
    datos[t] = (await pool.query(`select * from ${t} order by ${TABLAS[t].pk.join(', ')}`)).rows.map((f) => deFila(t, f))
  }
  if (!datos.usuarios.length) return null
  const estado = { ...datos, sesiones: new Map(datos.sesiones.map(({ token, ...s }) => [token, s])) }
  estado.ultimosIds = new Map(datos.ids.map(({ lista, ultimo }) => [estado[lista], ultimo]))
  delete estado.ids
  return estado
}

// Guarda lo que cambió desde el último guardado. Las escrituras van en fila (una a la vez) para no cruzarse
export function guardador(pool, log = console) {
  const guardado = {} // tabla → llave → JSON de la fila ya escrita
  let cola = Promise.resolve()

  async function escribir(estado) {
    const actual = filasDe(estado)
    const cambios = []
    for (const [t, filas] of Object.entries(actual)) {
      const antes = guardado[t] ?? new Map()
      const ahora = new Map(filas.map((o) => [llave(t, o), o]))
      const nuevas = [...ahora].filter(([k, o]) => antes.get(k) !== JSON.stringify(o))
      const borradas = [...antes.keys()].filter((k) => !ahora.has(k))
      if (nuevas.length || borradas.length) cambios.push({ t, nuevas, borradas, ahora })
    }
    if (!cambios.length) return
    const cliente = await pool.connect()
    try {
      await cliente.query('begin')
      for (const { t, nuevas, borradas } of cambios) {
        const { pk, cols } = TABLAS[t]
        const nombres = [...cols.map(([c]) => c), 'extra']
        // De 200 en 200 filas por consulta: la primera carga son miles
        for (let i = 0; i < nuevas.length; i += 200) {
          const lote = nuevas.slice(i, i + 200)
          const valores = lote.flatMap(([, o]) => aFila(t, o))
          const marcas = lote.map((_, j) => `(${nombres.map((__, k) => `$${j * nombres.length + k + 1}`).join(', ')})`).join(', ')
          const actualizar = nombres.filter((c) => !pk.includes(c)).map((c) => `${c} = excluded.${c}`).join(', ')
          await cliente.query(`insert into ${t} (${nombres.join(', ')}) values ${marcas} on conflict (${pk.join(', ')}) do update set ${actualizar}`, valores)
        }
        for (const k of borradas) {
          const partes = k.split('|')
          await cliente.query(`delete from ${t} where ${pk.map((c, i) => `${c} = $${i + 1}`).join(' and ')}`, partes)
        }
      }
      await cliente.query('commit')
      // Solo después de confirmar: si falla, el siguiente guardado vuelve a intentar lo mismo
      for (const { t, ahora } of cambios) guardado[t] = new Map([...ahora].map(([k, o]) => [k, JSON.stringify(o)]))
    } catch (e) {
      await cliente.query('rollback').catch(() => {})
      log.error({ err: e }, 'no se pudo guardar en PostgreSQL; se reintenta en la siguiente petición')
    } finally {
      cliente.release()
    }
  }

  return {
    // Marca como ya guardado lo que se acaba de cargar (no se reescribe al arrancar)
    yaGuardado(estado) {
      for (const [t, filas] of Object.entries(filasDe(estado))) guardado[t] = new Map(filas.map((o) => [llave(t, o), JSON.stringify(o)]))
    },
    guardar(estado) {
      cola = cola.then(() => escribir(estado))
      return cola
    },
  }
}
