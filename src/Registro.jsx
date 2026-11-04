import { useState } from 'react'
import { api, passwordValida } from './comun.js'
import { t } from './i18n.js'
import { Campo, PasswordNueva } from './ui.jsx'

// Registro: solo quien viene en la plantilla de su departamento. Con su número y correo (los que cargó su gerente)
// elige su contraseña; puesto, turno, departamento y encargado ya vienen de la plantilla
export default function Registro({ volver }) {
  const [no, setNo] = useState('')
  const [email, setEmail] = useState('')
  const [p, setP] = useState(['', ''])
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function crear(e) {
    e.preventDefault()
    setError('')
    if (!/^\d{4,10}$/.test(no.trim()) || !/^\S+@\S+\.\S+$/.test(email.trim())) return setError(t('Escribe tu número de empleado y tu correo.'))
    if (!passwordValida(...p)) return setError(t('La contraseña no cumple los requisitos.'))
    setEnviando(true)
    try {
      await api('/api/registro', { method: 'POST', body: { no: no.trim(), email: email.trim(), password: p[0] } })
      volver(t('Cuenta lista. Inicia sesión: la primera vez vinculas tu app autenticadora.'))
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={crear} noValidate>
      <h1>{t('Crear cuenta')}</h1>
      <p className="lead">{t('Usa el número de empleado y el correo con los que tu gerente te dio de alta en la plantilla de tu departamento.')}</p>
      <Campo label={t('Número de empleado')} id="no" inputMode="numeric" maxLength={10} value={no} onChange={(e) => setNo(e.target.value)} />
      <Campo label={t('Correo electrónico')} id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <PasswordNueva p1={p[0]} p2={p[1]} onChange={(a, b) => { setP([a, b]); setError('') }} etiqueta="Contraseña" />
      <p className="error" role="alert">{error}</p>
      <button className="btn btn-primary btn-block" type="submit" disabled={enviando}>{t('Crear cuenta')}</button>
      <button type="button" className="btn btn-ghost" onClick={() => volver()}>← {t('Volver')}</button>
    </form>
  )
}
