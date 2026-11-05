import { useEffect, useState } from 'react'
import { api, horas, hoy, nombreTurno, rol } from './comun.js'
import Icono from './Icono.jsx'
import { Avatar } from './ui.jsx'
import { t } from './i18n.js'

const haceDias = (n) => new Date(Date.now() - n * 86_400_000).toLocaleDateString('en-CA')
const pct = ([hechas, total]) => (total ? Math.round((hechas / total) * 100) : null)
// Umbral de color: el mismo 85 % que marca en rojo el rate de aprobación
const nivel = (v) => (v == null ? 'nulo' : v >= 85 ? 'alto' : v >= 70 ? 'medio' : 'bajo')
const sumar = (filas, campo) => filas.reduce(([h, tt], f) => [h + f[campo][0], tt + f[campo][1]], [0, 0])

export default function Matriz({ user }) {
  const [desde, setDesde] = useState(() => haceDias(30))
  const [hasta, setHasta] = useState(hoy)
  const [filas, setFilas] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!desde || !hasta) return
    let vigente = true // al cambiar rápido de fechas, solo cuenta la última respuesta
    api(`/api/matriz/${user.no}?desde=${desde}&hasta=${hasta}&hoy=${hoy()}`)
      .then((f) => vigente && (setError(''), setFilas(f)))
      .catch((e) => vigente && setError(e.message))
    return () => { vigente = false }
  }, [user.no, desde, hasta])

  const [orden, setOrden] = useState(null) // { col, desc }: sin orden, el del servidor (por puesto y nombre)
  const total = filas && {
    diarias: sumar(filas, 'diarias'), urgentes: sumar(filas, 'urgentes'), asistencia: sumar(filas, 'asistencia'),
    extra: filas.reduce((s, f) => s + f.extra, 0), extraPlan: filas.reduce((s, f) => s + f.extraPlan, 0),
  }
  const maxExtra = Math.max(1, ...(filas ?? []).map((f) => f.extra))
  // Sin dato (—) queda al final en cualquier sentido
  const valor = (f, col) => (col === 'name' ? f.name : col === 'extra' ? f.extra : pct(f[col]))
  const ordenadas = !filas || !orden ? filas : [...filas].sort((a, b) => {
    const [x, y] = [valor(a, orden.col), valor(b, orden.col)]
    if (x == null || y == null) return (x == null) - (y == null)
    return (typeof x === 'string' ? x.localeCompare(y) : x - y) * (orden.desc ? -1 : 1)
  })
  const ordenarPor = (col) => setOrden((o) => (o?.col === col ? { col, desc: !o.desc } : { col, desc: col !== 'name' }))
  const COLUMNAS = { diarias: t('Yield diarias'), urgentes: t('Yield urgentes'), extra: t('Tiempo extra'), asistencia: t('Asistencia') }

  return (
    <>
      <div className="page-head">
        <h1>{t('Matriz de seguimiento')}</h1>
        <p>{t('Yield de actividades diarias y urgentes, tiempo extra y asistencia de tu equipo en el periodo.')}</p>
      </div>

      <div className="card filters periodo">
        <label className="field"><span>{t('Desde')}</span><input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></label>
        <label className="field"><span>{t('Hasta')}</span><input type="date" value={hasta} min={desde} max={hoy()} onChange={(e) => setHasta(e.target.value)} /></label>
        <ul className="leyenda" aria-label={t('Cómo leer la matriz')}>
          <li><i data-nivel="alto" />{t('85 % o más')}</li>
          <li><i data-nivel="medio" />{t('70 a 84 %')}</li>
          <li><i data-nivel="bajo" />{t('Menos de 70 %')}</li>
          <li><i className="extra" />{t('Más tiempo extra, más intenso')}</li>
          <li className="muted">{t('Yield: realizadas ÷ asignadas (las de hoy abiertas aún no cuentan). Tiempo extra (más de 15 min después del fin del turno, con la salida marcada) y asistencia (días hábiles con entrada en el checador): hasta ayer.')}</li>
        </ul>
      </div>

      {error ? <p className="error" role="alert">{error}</p>
        : !filas ? <p className="muted">{t('Cargando…')}</p>
        : !filas.length ? <section className="card empty">{t('No tienes empleados a tu cargo.')}</section>
        : (
          <div className="table-wrap">
            <table className="matriz">
              <caption className="sr">{t('Matriz de seguimiento')}</caption>
              <thead>
                <tr>
                  <Cabeza col="name" orden={orden} ordenar={ordenarPor}>{t('Empleado')}</Cabeza>
                  {Object.entries(COLUMNAS).map(([col, txt]) => <Cabeza key={col} col={col} orden={orden} ordenar={ordenarPor}>{txt}</Cabeza>)}
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((f) => (
                  <tr key={f.no}>
                    <th scope="row">
                      <span className="quien">
                        <Avatar no={f.no} name={f.name} />
                        <span>{f.name}<small>{rol(f.role)} · {nombreTurno(f.shift)}</small></span>
                      </span>
                    </th>
                    <Celda par={f.diarias} etq={COLUMNAS.diarias} />
                    <Celda par={f.urgentes} etq={COLUMNAS.urgentes} />
                    <Extra min={f.extra} plan={f.extraPlan} max={maxExtra} etq={COLUMNAS.extra} />
                    <Celda par={f.asistencia} dias etq={COLUMNAS.asistencia} />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">{t('Equipo')} <small>{t('{n} personas', { n: filas.length })}</small></th>
                  <Celda par={total.diarias} etq={COLUMNAS.diarias} />
                  <Celda par={total.urgentes} etq={COLUMNAS.urgentes} />
                  <Extra min={total.extra} plan={total.extraPlan} etq={COLUMNAS.extra} />
                  <Celda par={total.asistencia} dias etq={COLUMNAS.asistencia} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
    </>
  )
}

function Cabeza({ col, orden, ordenar, children }) {
  return (
    <th scope="col" aria-sort={orden?.col === col ? (orden.desc ? 'descending' : 'ascending') : undefined}>
      <button type="button" className="ordenar" onClick={() => ordenar(col)}>
        {children}<Icono nombre="abajo" />
      </button>
    </th>
  )
}

// etq: en celular la tabla se vuelve tarjetas y cada celda dice qué es
function Celda({ par, dias, etq }) {
  const v = pct(par)
  return (
    <td className="num" data-nivel={nivel(v)} data-etq={etq}>
      {v == null ? '—' : `${v}%`}
      {par[1] > 0 && <small>{t(dias ? '{a} de {b} días' : '{a} de {b}', { a: par[0], b: par[1] })}</small>}
    </td>
  )
}

// Más tiempo extra, más intenso el fondo: no es bueno ni malo, señala dónde se está cargando el turno.
// Debajo, lo que registraron: cuenta solo lo que se quedaron de verdad (hasta lo registrado)
function Extra({ min, plan, max, etq }) {
  return (
    <td className="num extra" data-etq={etq} style={max ? { '--carga': `${Math.round((min / max) * 40)}%` } : undefined}>
      {plan || min ? <>{horas(min)}<span className="unidad"> h</span></> : '—'}
      {plan > 0 && <small>{t('de {h} h registradas', { h: horas(plan) })}</small>}
    </td>
  )
}
