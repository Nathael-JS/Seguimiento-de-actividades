import { useState } from 'react'
import { api, passwordValida } from './comun.js'
import { BotonIdioma, BotonTema, Campo, PasswordNueva } from './ui.jsx'
import { t } from './i18n.js'

// Entró con la contraseña temporal que le dio un super administrador: antes de seguir crea la suya
export default function CambioObligatorio({ user, onListo, onSalir }) {
  const [actual, setActual] = useState('')
  const [p, setP] = useState(['', ''])
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function guardar(e) {
    e.preventDefault()
    if (!actual) return setError(t('Escribe la contraseña temporal.'))
    if (!passwordValida(...p)) return setError(t('La contraseña no cumple los requisitos.'))
    setError('')
    setEnviando(true)
    try {
      await api(`/api/perfil/${user.no}/password`, { method: 'POST', body: { actual, nueva: p[0] } })
      onListo()
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }

  return (
    <div className="auth solo">
      <main className="auth-main">
        <div className="auth-top">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onSalir}>← {t('Cerrar sesión')}</button>
          <span className="spacer" /><BotonIdioma /><BotonTema />
        </div>
        <form className="auth-form" onSubmit={guardar} noValidate>
          <h1>{t('Crea tu contraseña')}</h1>
          <p className="lead">{t('{nombre}, entraste con una contraseña temporal. Crea la tuya para continuar.', { nombre: user.name.split(' ')[0] })}</p>
          <Campo label={t('Contraseña temporal')} id="actual" type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} autoFocus />
          <PasswordNueva p1={p[0]} p2={p[1]} onChange={(a, b) => { setP([a, b]); setError('') }} />
          <p className="error" role="alert">{error}</p>
          <button className="btn btn-primary btn-block" type="submit" disabled={enviando}>{t(enviando ? 'Guardando…' : 'Guardar y entrar')}</button>
        </form>
      </main>
    </div>
  )
}
