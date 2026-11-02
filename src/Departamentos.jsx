import { useEffect, useState } from 'react'
import { DEPARTAMENTOS, TURNOS, api, consultaRate, depto, iniciales, rol } from './comun.js'
import { t } from './i18n.js'
import { Rate } from './ui.jsx'

export default function Departamentos() {
  const [empleados, setEmpleados] = useState(null)
  const [error, setError] = useState('')
  const [dept, setDept] = useState('lc')

  useEffect(() => {
    api(`/api/departamentos?${consultaRate()}`).then(setEmpleados).catch((e) => setError(e.message))
  }, [])

  if (error) return <p className="error" role="alert">{error}</p>
  if (!empleados) return <p className="muted">{t('Cargando…')}</p>

  const lista = empleados.filter((e) => e.dept === dept)

  return (
    <>
      <div className="page-head">
        <h1>{t('Departamentos')}</h1>
        <p>{t('Departamentos registrados con su plantilla completa.')} {t('Rate de aprobación: % de actividades de los últimos 30 días realizadas a tiempo.')}</p>
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
                <td><Rate valor={e.rate} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
