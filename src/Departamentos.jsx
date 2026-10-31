import { useEffect, useState } from 'react'
import { DEPARTAMENTOS, TURNOS, api, depto, iniciales, rol } from './comun.js'
import { t } from './i18n.js'

export default function Departamentos() {
  const [empleados, setEmpleados] = useState(null)
  const [error, setError] = useState('')
  const [dept, setDept] = useState('lc')

  useEffect(() => {
    api('/api/departamentos').then(setEmpleados).catch((e) => setError(e.message))
  }, [])

  if (error) return <p className="error" role="alert">{error}</p>
  if (!empleados) return <p className="muted">{t('Cargando…')}</p>

  const lista = empleados.filter((e) => e.dept === dept)

  return (
    <>
      <div className="page-head">
        <h1>{t('Departamentos')}</h1>
        <p>{t('Departamentos registrados con su plantilla completa.')}</p>
      </div>

      <div className="tabs" role="tablist" aria-label={t('Departamentos')}>
        {Object.keys(DEPARTAMENTOS).map((k) => (
          <button key={k} role="tab" id={`tab-${k}`} aria-selected={dept === k} aria-controls="plantilla" onClick={() => setDept(k)}>
            {depto(k)} <span className="muted mono" style={{ fontSize: 12 }}>{empleados.filter((e) => e.dept === k).length}</span>
          </button>
        ))}
      </div>

      <div className="table-wrap" role="tabpanel" id="plantilla" aria-labelledby={`tab-${dept}`}>
        <table>
          <thead>
            <tr>{['Puesto', 'Nombre', 'Número de empleado', 'Turno', 'Área', 'Rate de aprobación'].map((c) => <th key={c} scope="col">{t(c)}</th>)}</tr>
          </thead>
          <tbody>
            {lista.map((e) => (
              <tr key={e.no}>
                <td><span className="chip">{rol(e.role)}</span></td>
                <td><div className="row" style={{ gap: 10 }}><span className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>{iniciales(e.name)}</span>{e.name}</div></td>
                <td className="mono">{e.no}</td>
                <td className="nowrap">{e.shift} <span className="muted mono" style={{ fontSize: 12 }}>{TURNOS[e.shift]}</span></td>
                <td>{e.area}</td>
                <td>
                  {/* shortcut: rate fijo de los datos de prueba; definir cómo se calcula (p. ej. % de actividades realizadas) */}
                  {e.rate == null ? <span className="muted">{t('Sin datos')}</span> : (
                    <div className={`rate${e.rate < 85 ? ' lo' : ''}`}>
                      <span className="bar"><i style={{ width: `${e.rate}%` }} /></span>
                      <span className="mono">{e.rate}%</span>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
