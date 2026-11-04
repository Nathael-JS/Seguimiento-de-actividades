import { useEffect, useState } from 'react'
import { api, hoy, nombreTurno, rol } from './comun.js'
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

  const total = filas && {
    diarias: sumar(filas, 'diarias'), urgentes: sumar(filas, 'urgentes'), asistencia: sumar(filas, 'asistencia'),
  }

  return (
    <>
      <div className="page-head">
        <h1>{t('Matriz de seguimiento')}</h1>
        <p>{t('Yield de actividades diarias y urgentes y asistencia de tu equipo en el periodo.')}</p>
      </div>

      <div className="card filters periodo">
        <label className="field"><span>{t('Desde')}</span><input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></label>
        <label className="field"><span>{t('Hasta')}</span><input type="date" value={hasta} min={desde} max={hoy()} onChange={(e) => setHasta(e.target.value)} /></label>
        <ul className="leyenda" aria-label={t('Cómo leer la matriz')}>
          <li><i data-nivel="alto" />{t('85 % o más')}</li>
          <li><i data-nivel="medio" />{t('70 a 84 %')}</li>
          <li><i data-nivel="bajo" />{t('Menos de 70 %')}</li>
          <li className="muted">{t('Yield: realizadas ÷ asignadas (las de hoy abiertas aún no cuentan). Asistencia (días hábiles con entrada en el checador): hasta ayer.')}</li>
        </ul>
      </div>

      {error ? <p className="error" role="alert">{error}</p>
        : !filas ? <p className="muted">{t('Cargando…')}</p>
        : !filas.length ? <section className="card empty">{t('No tienes empleados a tu cargo.')}</section>
        : (
          <div className="table-wrap">
            <table className="matriz">
              <thead>
                <tr>
                  <th scope="col">{t('Empleado')}</th>
                  <th scope="col">{t('Yield diarias')}</th>
                  <th scope="col">{t('Yield urgentes')}</th>
                  <th scope="col">{t('Asistencia')}</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.no}>
                    <th scope="row">
                      <span className="quien">
                        <Avatar no={f.no} name={f.name} />
                        <span>{f.name}<small>{rol(f.role)} · {nombreTurno(f.shift)}</small></span>
                      </span>
                    </th>
                    <Celda par={f.diarias} />
                    <Celda par={f.urgentes} />
                    <Celda par={f.asistencia} dias />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">{t('Equipo')} <small>{t('{n} personas', { n: filas.length })}</small></th>
                  <Celda par={total.diarias} />
                  <Celda par={total.urgentes} />
                  <Celda par={total.asistencia} dias />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
    </>
  )
}

function Celda({ par, dias }) {
  const v = pct(par)
  return (
    <td className="num" data-nivel={nivel(v)}>
      {v == null ? '—' : `${v}%`}
      {par[1] > 0 && <small>{t(dias ? '{a} de {b} días' : '{a} de {b}', { a: par[0], b: par[1] })}</small>}
    </td>
  )
}
