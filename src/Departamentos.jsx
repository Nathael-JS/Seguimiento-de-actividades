import { useEffect, useState } from 'react'
import { TURNOS, api, consultaRate, depto, iniciales, rol } from './comun.js'
import { t } from './i18n.js'
import { Rate } from './ui.jsx'

// Solo el departamento propio: el servidor no entrega la plantilla de los demás
export default function Departamentos({ user }) {
  const [empleados, setEmpleados] = useState(null)
  const [error, setError] = useState('')
  // Un gerente puede dirigir más de un departamento: uno a la vez
  const [dept, setDept] = useState(user.dept)

  useEffect(() => {
    api(`/api/departamentos?${consultaRate()}`).then(setEmpleados).catch((e) => setError(e.message))
  }, [])

  if (error) return <p className="error" role="alert">{error}</p>
  if (!empleados) return <p className="muted">{t('Cargando…')}</p>
  const deptos = [...new Set([user.dept, ...empleados.map((e) => e.dept)])]
  const lista = empleados.filter((e) => e.dept === dept)

  return (
    <>
      <div className="page-head">
        <h1>{depto(dept)}</h1>
        <p>{t('Plantilla completa de tu departamento.')} {t('Rate de aprobación: % de actividades de los últimos 30 días realizadas a tiempo.')}</p>
      </div>

      {deptos.length > 1 && (
        <div className="chips" role="group" aria-label={t('Departamentos')} style={{ marginBottom: 16 }}>
          {deptos.map((k) => <button key={k} aria-pressed={dept === k} onClick={() => setDept(k)}>{depto(k)}</button>)}
        </div>
      )}
      <div className="table-wrap">
        <table>
          <caption className="sr">{t('Plantilla de {departamento}: {n} personas', { departamento: depto(dept), n: lista.length })}</caption>
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
