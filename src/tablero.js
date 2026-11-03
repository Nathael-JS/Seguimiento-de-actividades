import { esEncargado, pctRealizadas } from './comun.js'

const cifras = (acts) => ({
  actividades: acts.length,
  realizadas: acts.filter((a) => a.status === 'done').length,
  incompletas: acts.filter((a) => a.status === 'incomplete').length,
  avance: acts.length ? pctRealizadas(acts) : null, // % realizadas; null: sin actividades, el anillo muestra "—"
})

// Resumen del área de un gerente. `equipo` es /api/equipo con ?desde (cada miembro con sus actividades
// abiertas y las realizadas hoy) y `hoy` la fecha local AAAA-MM-DD
export function resumenArea(equipo, hoy) {
  const rama = (no) => equipo.filter((e) => e.boss === no).flatMap((e) => [e, ...rama(e.no)])
  const todas = equipo.flatMap((e) => e.actividades.map((a) => ({ ...a, persona: e.name })))
  return {
    // Cada líder con todo lo que tiene debajo (sus actividades y las de su rama)
    lideres: equipo.filter((e) => esEncargado(e.role)).map((l) => {
      const gente = [l, ...rama(l.no)]
      return { ...l, personas: gente.length - 1, ...cifras(gente.flatMap((e) => e.actividades)) }
    }),
    turnos: ['A', 'B', 'C'].map((turno) => ({
      turno, personas: equipo.filter((e) => e.shift === turno).length, ...cifras(todas.filter((a) => a.shift === turno)),
    })),
    incompletas: todas.filter((a) => a.status === 'incomplete'),
    // Siguen abiertas y su fecha ya pasó (las incompletas van en su propia lista).
    // Misma regla que generarAvisos en server/app.js: si cambia una, cambiar la otra
    atrasadas: todas.filter((a) => (a.status === 'pending' || a.status === 'progress') && a.date < hoy),
    sinActividades: equipo.filter((e) => !esEncargado(e.role) && !e.actividades.length),
  }
}
