import { useState } from 'react'

export default function Login({ onLogin }) {
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    const usuario = e.target.usuario.value.trim()
    const password = e.target.password.value
    const errs = {
      ...(!usuario && { usuario: 'Escribe tu usuario o correo.' }),
      ...(!password && { password: 'Escribe tu contraseña.' }),
    }
    setErrors(errs)
    setError('')
    if (Object.keys(errs).length) return

    setLoading(true)
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, password }),
      })
      const data = await res.json()
      if (res.ok) return onLogin(data)
      setError(res.status === 401 ? data.error : 'Revisa los datos ingresados.')
    } catch {
      setError('No se pudo conectar con el servidor. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth">
      <aside className="auth-art">
        <div className="brandname"><i />Seguimiento de Actividades</div>
        <div>
          <h2>Cada turno, a la vista.</h2>
          <p>Asigna, ejecuta y supervisa las actividades de cada turno en un solo lugar.</p>
        </div>
      </aside>
      <main className="auth-main">
        <form className="auth-form" onSubmit={submit} noValidate>
          <h1>Iniciar sesión</h1>
          <p className="lead">Ingresa con tu usuario, correo o número de empleado.</p>
          <Field name="usuario" label="Usuario o correo electrónico" error={errors.usuario} autoComplete="username" placeholder="jorge.salinas@empresa.com" />
          <Field name="password" label="Contraseña" error={errors.password} type="password" autoComplete="current-password" />
          <p className="error" role="alert">{error}</p>
          <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </main>
    </div>
  )
}

function Field({ name, label, error, ...props }) {
  return (
    <label className={`field${error ? ' is-error' : ''}`}>
      <span>{label}</span>
      <input name={name} maxLength={100} aria-invalid={!!error} {...props} />
      {error && <small>{error}</small>}
    </label>
  )
}
