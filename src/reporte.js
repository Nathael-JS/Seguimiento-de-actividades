import { esEncargado, promedio } from './comun.js'

// Fecha local (del navegador) de un instante: "a tiempo" = realizada a más tardar el día que le tocaba
const diaLocal = (iso) => new Date(iso).toLocaleDateString('en-CA')

// Mismas reglas que el resto de la app: el % a tiempo es el del rate de aprobación (las de hoy abiertas aún
// no cuentan; la original heredada cuenta como no realizada) y "atrasada" la de generarAvisos y tablero.js
function cifras(filas, hoy) {
  const cuentan = filas.filter((f) => f.status === 'done' || f.date < hoy)
  const aTiempo = cuentan.filter((f) => f.status === 'done' && diaLocal(f.doneAt) <= f.date).length
  const vivas = filas.filter((f) => !f.heredadaA)
  return {
    actividades: filas.length,
    realizadas: filas.filter((f) => f.status === 'done').length,
    aTiempo: cuentan.length ? Math.round((aTiempo / cuentan.length) * 100) : null,
    incompletas: filas.filter((f) => f.status === 'incomplete').length,
    atrasadas: vivas.filter((f) => (f.status === 'pending' || f.status === 'progress') && f.date < hoy).length,
    avance: vivas.length ? promedio(vivas) : null,
  }
}

// Mayor % a tiempo primero; sin dato al final
const porATiempo = (a, b) => (b.aTiempo ?? -1) - (a.aTiempo ?? -1) || a.name.localeCompare(b.name)

// Comparativo del reporte. `filas`: /api/reportes; `equipo`: /api/equipo (con jefe de cada uno); `user`: quien consulta
export function comparar(filas, equipo, user, hoy) {
  const personas = [user, ...equipo]
  const empleados = [...new Set(filas.map((f) => f.no))].map((no) => {
    const p = personas.find((x) => x.no === no)
    return { no, name: p.name, role: p.role, ...cifras(filas.filter((f) => f.no === no), hoy) }
  })
  // Cada líder (quien consulta y los encargados de su equipo) con todo lo que tiene debajo
  const rama = (no) => equipo.filter((e) => e.boss === no).flatMap((e) => [e.no, ...rama(e.no)])
  const lideres = [user, ...equipo.filter((e) => esEncargado(e.role))].flatMap((l) => {
    const suyos = new Set([l.no, ...rama(l.no)])
    const deEl = filas.filter((f) => suyos.has(f.no))
    // personas: las de su rama con actividades en el periodo, sin contar al líder (igual que el Inicio del gerente)
    const personas = new Set(deEl.map((f) => f.no).filter((no) => no !== l.no)).size
    return deEl.length ? [{ no: l.no, name: l.name, role: l.role, personas, ...cifras(deEl, hoy) }] : []
  })
  return { empleados: empleados.sort(porATiempo), lideres: lideres.sort(porATiempo) }
}
