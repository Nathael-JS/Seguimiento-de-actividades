import { useEffect, useState } from 'react'
import { DEPARTAMENTOS, ESTADOS, ROLES, TURNOS, api, hora, hoy, promedio } from './comun.js'
import { Estado } from './ui.jsx'

const haceUnaSemana = () => new Date(Date.now() - 7 * 86_400_000).toLocaleDateString('en-CA')

const COLUMNAS = ['Fecha', 'Turno', 'Hora', 'Empleado', 'Puesto', 'Departamento', 'Actividad', 'Avance %', 'Estado', 'Comentarios', 'Acción tomada']
const accion = (f) => (f.heredadaA ? `Heredada a ${f.heredadaA}` : f.inh ? 'Recibida por herencia' : f.mgr)
const celdas = (f) => [f.date, f.shift, hora(f.at), f.name, ROLES[f.role], DEPARTAMENTOS[f.dept], f.text, f.pct, ESTADOS[f.status], f.note, accion(f)]

// Excel ejecuta como fórmula una celda que empieza con = + - @; el apóstrofo la deja como texto
const celdaCsv = (v) => {
  const s = String(v ?? '')
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replaceAll('"', '""')}"`
}

function descargarCsv(filas, nombre) {
  const csv = [COLUMNAS, ...filas.map(celdas)].map((fila) => fila.map(celdaCsv).join(',')).join('\r\n')
  // El BOM hace que Excel lea los acentos como UTF-8
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

export default function Reportes({ user }) {
  const [equipo, setEquipo] = useState(null)
  const [elegidos, setElegidos] = useState([])
  const [desde, setDesde] = useState(haceUnaSemana)
  const [hasta, setHasta] = useState(hoy)
  const [turno, setTurno] = useState('')
  const [filas, setFilas] = useState(null)
  const [error, setError] = useState('')
  const [generando, setGenerando] = useState(false)

  useEffect(() => {
    api(`/api/equipo/${user.no}`)
      .then((e) => {
        setEquipo(e)
        // Como en el mockup, de inicio quedan marcados los ejecutores
        setElegidos(e.filter((x) => x.role === 'tec' || x.role === 'jr').map((x) => x.no))
      })
      .catch((e) => setError(e.message))
  }, [user.no])

  const personas = [user, ...(equipo ?? [])]
  const alternar = (no) => setElegidos(elegidos.includes(no) ? elegidos.filter((x) => x !== no) : [...elegidos, no])

  async function generar(ev) {
    ev.preventDefault()
    if (!elegidos.length) return setError('Selecciona al menos un empleado.')
    if (!desde || !hasta) return setError('Elige las fechas.')
    if (desde > hasta) return setError('La fecha "Desde" debe ser anterior a "Hasta".')
    setError('')
    setGenerando(true)
    try {
      setFilas(await api('/api/reportes', {
        method: 'POST',
        body: { por: user.no, empleados: elegidos, desde, hasta, ...(turno && { turno }) },
      }))
    } catch (e) {
      setError(e.message)
    } finally {
      setGenerando(false)
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Reportes</h1>
        <p>Elige uno o más empleados y genera su reporte de actividades.</p>
      </div>

      <form className="card filters" onSubmit={generar} noValidate>
        <fieldset className="field wide">
          <legend>Empleados</legend>
          <div className="checklist">
            <label>
              <input type="checkbox" checked={elegidos.length === personas.length}
                onChange={(e) => setElegidos(e.target.checked ? personas.map((p) => p.no) : [])} />
              <b>Seleccionar todos</b>
            </label>
            {personas.map((p) => (
              <label key={p.no}>
                <input type="checkbox" checked={elegidos.includes(p.no)} onChange={() => alternar(p.no)} />
                {p.name} <span className="muted" style={{ fontSize: 12 }}>· {ROLES[p.role]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="field"><span>Desde</span><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
        <label className="field"><span>Hasta</span><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
        <label className="field">
          <span>Turno</span>
          <select value={turno} onChange={(e) => setTurno(e.target.value)}>
            <option value="">Todos los turnos</option>
            {Object.entries(TURNOS).map(([k, v]) => <option key={k} value={k}>{k} · {v}</option>)}
          </select>
        </label>
        <button className="btn btn-primary" type="submit" disabled={generando || !equipo}>
          {generando ? 'Generando…' : 'Generar reporte'}
        </button>
        {error && <p className="error wide" role="alert">{error}</p>}
      </form>

      {filas && (
        <section className="reporte">
          <div className="row between" style={{ flexWrap: 'wrap' }}>
            <p className="muted">
              <b className="mono" style={{ color: 'var(--ink)' }}>{filas.length}</b> registros · Avance promedio: <b className="mono" style={{ color: 'var(--ink)' }}>{promedio(filas)}%</b>
              <span className="solo-impresion"> · {desde} a {hasta}{turno && ` · Turno ${turno}`}</span>
            </p>
            <div className="row no-imprimir">
              <button className="btn btn-secondary btn-sm" onClick={() => window.print()} disabled={!filas.length}>Exportar PDF</button>
              <button className="btn btn-secondary btn-sm" onClick={() => descargarCsv(filas, `reporte-${desde}-a-${hasta}.csv`)} disabled={!filas.length}>
                Exportar Excel
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr>{COLUMNAS.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
              <tbody>
                {filas.length ? filas.map((f) => (
                  <tr key={f.id}>
                    <td className="mono">{f.date}</td><td>{f.shift}</td><td className="mono">{hora(f.at)}</td>
                    <td>{f.name}</td><td>{ROLES[f.role]}</td><td>{DEPARTAMENTOS[f.dept]}</td><td>{f.text}</td>
                    <td className="mono">{f.pct}%</td><td><Estado estado={f.status} /></td>
                    <td>{f.note || '—'}</td><td>{accion(f) || '—'}</td>
                  </tr>
                )) : <tr><td colSpan={COLUMNAS.length} className="empty">Sin registros para estos filtros.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}
