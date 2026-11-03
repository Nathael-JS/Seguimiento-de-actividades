import { useEffect, useState } from 'react'
import { TURNOS, api, depto, descargarCsv, estado, hora, hoy, pctRealizadas, rol } from './comun.js'
import { t } from './i18n.js'
import { comparar } from './reporte.js'
import { Estado, Rate } from './ui.jsx'

const haceUnaSemana = () => new Date(Date.now() - 7 * 86_400_000).toLocaleDateString('en-CA')

const COLUMNAS = ['Fecha', 'Turno', 'Hora', 'Empleado', 'Puesto', 'Departamento', 'Actividad', 'Estado', 'Comentarios', 'Acción tomada']
function accion(f) {
  if (f.heredadaA) return t('Heredada a {nombre}', { nombre: f.heredadaA })
  if (f.inh) return t('Recibida por herencia')
  if (f.prioridad === 'urgente') return t(f.cerrada ? 'Urgente · cerrada con el turno' : 'Urgente')
  if (f.prioridad) return t('Agregada por el empleado')
  return f.mgr
}
const celdas = (f) => [f.date, f.shift, hora(f.at), f.name, rol(f.role), depto(f.dept), f.text, estado(f.status), f.note, accion(f)]

// El % a tiempo va primero: es la cifra que se compara y en móvil queda a la vista sin desplazar
const COLUMNAS_COMPARATIVO = ['Nombre', 'Puesto', '% a tiempo', 'Atrasadas', 'Incompletas', 'Realizadas', 'Actividades']
const celdasComparativo = (x) => [x.name, rol(x.role), x.aTiempo ?? '', x.atrasadas, x.incompletas, x.realizadas, x.actividades]

export default function Reportes({ user }) {
  const [equipo, setEquipo] = useState(null)
  const [elegidos, setElegidos] = useState([])
  const [desde, setDesde] = useState(haceUnaSemana)
  const [hasta, setHasta] = useState(hoy)
  const [turno, setTurno] = useState('')
  const [filas, setFilas] = useState(null)
  const [vista, setVista] = useState('empleados')
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
    if (!elegidos.length) return setError(t('Selecciona al menos un empleado.'))
    if (!desde || !hasta) return setError(t('Elige las fechas.'))
    if (desde > hasta) return setError(t('La fecha "Desde" debe ser anterior a "Hasta".'))
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
        <h1>{t('Reportes')}</h1>
        <p>{t('Elige uno o más empleados y genera su reporte de actividades.')}</p>
      </div>

      <form className="card filters" onSubmit={generar} noValidate>
        <fieldset className="field wide">
          <legend>{t('Empleados')}</legend>
          <div className="checklist">
            <label>
              <input type="checkbox" checked={elegidos.length === personas.length}
                onChange={(e) => setElegidos(e.target.checked ? personas.map((p) => p.no) : [])} />
              <b>{t('Seleccionar todos')}</b>
            </label>
            {personas.map((p) => (
              <label key={p.no}>
                <input type="checkbox" checked={elegidos.includes(p.no)} onChange={() => alternar(p.no)} />
                {p.name} <span className="meta meta-sm">· {rol(p.role)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="field"><span>{t('Desde')}</span><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
        <label className="field"><span>{t('Hasta')}</span><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
        <label className="field">
          <span>{t('Turno')}</span>
          <select value={turno} onChange={(e) => setTurno(e.target.value)}>
            <option value="">{t('Todos los turnos')}</option>
            {Object.entries(TURNOS).map(([k, v]) => <option key={k} value={k}>{k} · {v}</option>)}
          </select>
        </label>
        <button className="btn btn-primary" type="submit" disabled={generando || !equipo}>
          {t(generando ? 'Generando…' : 'Generar reporte')}
        </button>
        {error && <p className="error wide" role="alert">{error}</p>}
      </form>

      {filas?.length > 0 && equipo && (
        <Comparativo filas={comparar(filas, equipo, user, hoy())[vista]} vista={vista} setVista={setVista}
          exportar={(x) => descargarCsv(COLUMNAS_COMPARATIVO, x.map(celdasComparativo), `${t('comparativo')}_${desde}_${hasta}.csv`)} />
      )}

      {filas && (
        <section className="reporte">
          <div className="row between" style={{ flexWrap: 'wrap' }}>
            <p className="muted">
              <b className="mono" style={{ color: 'var(--ink)' }}>{filas.length}</b> {t('registros')} · {t('Realizadas')}: <b className="mono" style={{ color: 'var(--ink)' }}>{pctRealizadas(filas.filter((f) => !f.heredadaA))}%</b>
              <span className="solo-impresion"> · {desde} – {hasta}{turno && ` · ${t('Turno')} ${turno}`}</span>
            </p>
            <div className="row no-imprimir">
              <button className="btn btn-secondary btn-sm" onClick={() => window.print()} disabled={!filas.length}>{t('Exportar PDF')}</button>
              <button className="btn btn-secondary btn-sm" onClick={() => descargarCsv(COLUMNAS, filas.map(celdas), `${t('reporte')}_${desde}_${hasta}.csv`)} disabled={!filas.length}>
                {t('Exportar Excel')}
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr>{COLUMNAS.map((c) => <th key={c} scope="col">{t(c)}</th>)}</tr></thead>
              <tbody>
                {filas.length ? filas.map((f) => (
                  <tr key={f.id}>
                    <td className="mono">{f.date}</td><td>{f.shift}</td><td className="mono">{hora(f.at)}</td>
                    <td>{f.name}</td><td>{rol(f.role)}</td><td>{depto(f.dept)}</td><td>{f.text}</td>
                    <td><Estado estado={f.status} /></td>
                    <td>{f.note || '—'}</td><td>{accion(f) || '—'}</td>
                  </tr>
                )) : <tr><td colSpan={COLUMNAS.length} className="empty">{t('Sin registros para estos filtros.')}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}

function Comparativo({ filas, vista, setVista, exportar }) {
  return (
    <section className="card comparativo">
      <div className="row between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 className="card-title" style={{ margin: 0 }}>{t('Comparativo')}</h2>
          <p className="meta">{t('% a tiempo: realizadas a más tardar el día que les tocaba (las de hoy abiertas aún no cuentan).')}</p>
        </div>
        <div className="row no-imprimir" style={{ flexWrap: 'wrap' }}>
          <div className="chips" role="group" aria-label={t('Comparar por')}>
            <button aria-pressed={vista === 'empleados'} onClick={() => setVista('empleados')}>{t('Por empleado')}</button>
            <button aria-pressed={vista === 'lideres'} onClick={() => setVista('lideres')}>{t('Por líder')}</button>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => exportar(filas)}>{t('Exportar comparativo')}</button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">{t(vista === 'lideres' ? 'Líder' : 'Empleado')}</th>
              {['% a tiempo', 'Atrasadas', 'Incompletas', 'Realizadas', 'Actividades'].map((c) => <th key={c} scope="col">{t(c)}</th>)}
            </tr>
          </thead>
          <tbody>
            {filas.map((x) => (
              <tr key={x.no}>
                <th scope="row">
                  {x.name} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· {rol(x.role)}{x.personas ? ` · ${t(x.personas === 1 ? '{n} persona' : '{n} personas', { n: x.personas })}` : ''}</span>
                </th>
                <td><Rate valor={x.aTiempo} /></td>
                <td className="mono">{x.atrasadas}</td>
                <td className={`mono${x.incompletas ? ' txt-incompleta' : ''}`}>{x.incompletas}</td>
                <td className="mono">{x.realizadas}</td>
                <td className="mono">{x.actividades}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
