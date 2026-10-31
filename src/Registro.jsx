import { useEffect, useState } from 'react'
import { DEPARTAMENTOS, ROLES, TURNOS, api, depto, esEncargado, passwordValida, rol } from './comun.js'
import { t } from './i18n.js'
import { Campo, PasswordNueva } from './ui.jsx'

const TITULOS = ['Datos del empleado', 'Asignación', 'Crea tu contraseña']

export default function Registro({ volver }) {
  const [paso, setPaso] = useState(1)
  const [d, setD] = useState({ name: '', no: '', email: '', role: 'tec', dept: 'lc', shift: 'A', boss: '', area: '' })
  const [p, setP] = useState(['', ''])
  const [empleados, setEmpleados] = useState([])
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const set = (campo) => (e) => setD({ ...d, [campo]: e.target.value })
  const encargado = esEncargado(d.role)
  // Posibles jefes: encargados del departamento elegido, del puesto más bajo al más alto
  const jefes = empleados.filter((e) => e.dept === d.dept && esEncargado(e.role)).reverse()

  useEffect(() => {
    api('/api/departamentos').then(setEmpleados).catch((e) => setError(e.message))
  }, [])

  function siguiente(e) {
    e.preventDefault()
    setError('')
    if (paso === 1) {
      if (d.name.trim().length < 3 || !/^\d{4,10}$/.test(d.no) || !/^\S+@\S+\.\S+$/.test(d.email)) {
        return setError(t('Escribe tu nombre completo, un número de empleado de 4 a 10 dígitos y un correo válido.'))
      }
      return setPaso(2)
    }
    if (paso === 2) {
      if (encargado && !d.area.trim()) return setError(t('Escribe tu área dentro del departamento.'))
      if (!encargado && !d.boss) return setError(t('Elige a tu encargado.'))
      return setPaso(3)
    }
    if (!passwordValida(...p)) return setError(t('La contraseña no cumple los requisitos.'))
    crear()
  }

  async function crear() {
    setEnviando(true)
    try {
      const { boss, area, ...resto } = d
      await api('/api/registro', {
        method: 'POST',
        body: { ...resto, ...(encargado ? { area } : { boss }), password: p[0] },
      })
      volver(t('Cuenta creada. Ya puedes iniciar sesión.'))
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={siguiente} noValidate>
      <h1>{t('Crear cuenta')}</h1>
      <div className="steps" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={paso} aria-label={t('Paso {n} de 3', { n: paso })}>
        {[1, 2, 3].map((i) => <span key={i} className={i <= paso ? 'on' : ''} />)}
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: -10 }}>{t('Paso {n} de 3', { n: paso })} · {t(TITULOS[paso - 1])}</p>

      {paso === 1 && (
        <>
          <Campo label={t('Nombre completo')} id="name" autoComplete="name" value={d.name} onChange={set('name')} />
          <div className="grid2">
            <Campo label={t('Número de empleado')} id="no" inputMode="numeric" maxLength={10} value={d.no} onChange={set('no')} />
            <Campo label={t('Correo electrónico')} id="email" type="email" autoComplete="email" value={d.email} onChange={set('email')} />
          </div>
          <fieldset className="field">
            <legend>{t('Puesto')}</legend>
            <div className="role-pick">
              {Object.keys(ROLES).map((k) => (
                <label key={k}><input type="radio" name="role" value={k} checked={d.role === k} onChange={set('role')} /><span>{rol(k)}</span></label>
              ))}
            </div>
          </fieldset>
        </>
      )}

      {paso === 2 && (
        <>
          <Campo label={t('Departamento')}>
            <select value={d.dept} onChange={(e) => setD({ ...d, dept: e.target.value, boss: '' })}>
              {Object.keys(DEPARTAMENTOS).map((k) => <option key={k} value={k}>{depto(k)}</option>)}
            </select>
          </Campo>
          {!encargado && (
            <Campo label={t('Encargado')}>
              <select value={d.boss} onChange={set('boss')}>
                <option value="">{t('Selecciona a tu encargado')}</option>
                {jefes.map((j) => <option key={j.no} value={j.no}>{j.name} · {rol(j.role)}</option>)}
              </select>
              <small>{t('Tu Ing. Full, Senior o Gerente directo.')}</small>
            </Campo>
          )}
          <Campo label={t('Turno')}>
            <select value={d.shift} onChange={set('shift')}>
              {Object.entries(TURNOS).map(([k, v]) => <option key={k} value={k}>{k} · {v}</option>)}
            </select>
          </Campo>
          {encargado && <Campo label={t('Área dentro del departamento')} id="area" placeholder="Estaciones LC245" value={d.area} onChange={set('area')} />}
        </>
      )}

      {paso === 3 && <PasswordNueva p1={p[0]} p2={p[1]} onChange={(a, b) => { setP([a, b]); setError('') }} etiqueta="Contraseña" />}

      <p className="error" role="alert">{error}</p>
      <div className="row between">
        <button type="button" className="btn btn-ghost" onClick={() => (paso === 1 ? volver() : setPaso(paso - 1))}>← {t('Volver')}</button>
        <button className="btn btn-primary" type="submit" disabled={enviando}>{t(paso === 3 ? 'Crear cuenta' : 'Continuar')}</button>
      </div>
    </form>
  )
}
