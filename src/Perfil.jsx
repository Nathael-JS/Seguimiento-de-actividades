import { useCallback, useEffect, useState } from 'react'
import { TURNOS, api, depto, iniciales, passwordValida, rol } from './comun.js'
import { t } from './i18n.js'
import Icono from './Icono.jsx'
import { AvisoPassword, Campo, PasswordNueva } from './ui.jsx'

export default function Perfil({ user, recargar, avisar }) {
  const [perfil, setPerfil] = useState(null)
  const [error, setError] = useState('')
  const [cambiando, setCambiando] = useState(false)

  const cargar = useCallback(
    () => api(`/api/perfil/${user.no}`).then(setPerfil).catch((e) => setError(e.message)),
    [user.no],
  )
  useEffect(() => { cargar() }, [cargar])

  if (error) return <p className="error" role="alert">{error}</p>
  if (!perfil) return <p className="muted">{t('Cargando…')}</p>

  return (
    <>
      <div className="page-head"><h1>{t('Perfil')}</h1></div>
      <div className="profile">
        <section className="card perfil-tarjeta">
          <span className="avatar lg">{iniciales(perfil.name)}</span>
          <h2 className="card-title" style={{ margin: 0 }}>{perfil.name}</h2>
          <span className="chip">{rol(perfil.role)}</span>
          <p className="muted mono" style={{ fontSize: 13 }}>{t('No.')} {perfil.no}</p>
        </section>

        <div className="pila">
          <section className="card">
            <dl className="dl">
              <dt>{t('Nombre completo')}</dt><dd>{perfil.name}</dd>
              <dt>{t('Cargo')}</dt><dd>{rol(perfil.role)}</dd>
              <dt>{t('Encargado')}</dt><dd>{perfil.bossName ? `${perfil.bossName} · ${rol(perfil.bossRole)}` : '—'}</dd>
              <dt>{t('Correo')}</dt><dd>{perfil.email}</dd>
              <dt>{t('Departamento')}</dt><dd>{depto(perfil.dept)} · {perfil.area}</dd>
              <dt>{t('Turno')}</dt><dd>{perfil.shift} · <span className="mono">{TURNOS[perfil.shift]}</span></dd>
            </dl>
          </section>

          <section className="card pila">
            <h2 className="card-title" style={{ margin: 0 }}>{t('Seguridad')}</h2>
            <div className="row between" style={{ flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div className="muted" style={{ fontSize: 13 }}>{t('Último cambio de contraseña')}</div>
                <div className="mono">{perfil.pwdChanged}</div>
              </div>
              {!cambiando && <button className="btn btn-secondary" onClick={() => setCambiando(true)}>{t('Cambiar contraseña')}</button>}
            </div>
            <AvisoPassword dias={perfil.diasPassword} siempre />
            {cambiando && (
              <CambiarPassword user={user} cancelar={() => setCambiando(false)}
                listo={() => { setCambiando(false); avisar(t('Contraseña actualizada.')); cargar(); recargar() }} />
            )}
          </section>
        </div>
      </div>
    </>
  )
}

function CambiarPassword({ user, cancelar, listo }) {
  const [actual, setActual] = useState('')
  const [p, setP] = useState(['', ''])
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function guardar(e) {
    e.preventDefault()
    if (!actual) return setError(t('Escribe tu contraseña actual.'))
    if (!passwordValida(...p)) return setError(t('La contraseña nueva no cumple los requisitos.'))
    setError('')
    setEnviando(true)
    try {
      await api(`/api/perfil/${user.no}/password`, { method: 'POST', body: { actual, nueva: p[0] } })
      listo()
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }

  return (
    <form className="pila cambiar-password" onSubmit={guardar} noValidate>
      <Campo label={t('Contraseña actual')} id="actual" type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} />
      <PasswordNueva p1={p[0]} p2={p[1]} onChange={(a, b) => { setP([a, b]); setError('') }} />
      <p className="error" role="alert">{error}</p>
      <div className="row end">
        <button type="button" className="btn btn-ghost" onClick={cancelar}>{t('Cancelar')}</button>
        <button className="btn btn-primary" type="submit" disabled={enviando}><Icono nombre="shield" />{t('Guardar contraseña')}</button>
      </div>
    </form>
  )
}
