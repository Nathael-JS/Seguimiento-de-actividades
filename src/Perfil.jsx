import { useCallback, useEffect, useState } from 'react'
import { TURNOS, api, consultaRate, depto, fecha, fotoCambiada, passwordValida, rol, turnoLargo } from './comun.js'
import { t } from './i18n.js'
import Icono from './Icono.jsx'
import { Avatar, AvisoPassword, BotonIdioma, Campo, PasswordNueva, Rate } from './ui.jsx'

export default function Perfil({ user, recargar, avisar }) {
  const [perfil, setPerfil] = useState(null)
  const [error, setError] = useState('')
  const [cambiando, setCambiando] = useState(false)

  const cargar = useCallback(
    () => api(`/api/perfil/${user.no}?${consultaRate()}`).then(setPerfil).catch((e) => setError(e.message)),
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
          <FotoPerfil user={user} perfil={perfil} avisar={avisar} />
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
              <dt>{t('Departamento')}</dt><dd>{perfil.dept ? `${depto(perfil.dept)} · ${perfil.area}` : perfil.area}</dd>
              <dt>{t('Turno')}</dt><dd>{turnoLargo(perfil.shift)} · <span className="mono">{TURNOS[perfil.shift]}</span></dd>
              <dt>{t('Idioma')}</dt><dd><BotonIdioma /></dd>
              <dt>{t('Rate de aprobación')}</dt><dd><Rate valor={perfil.rate} /> <small className="muted" style={{ fontWeight: 400 }}>{t('a tiempo, últimos 30 días')}</small></dd>
            </dl>
          </section>

          <section className="card pila">
            <h2 className="card-title" style={{ margin: 0 }}>{t('Seguridad')}</h2>
            <div className="row between" style={{ flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div className="meta">{t('Último cambio de contraseña')}</div>
                <div className="mono">{fecha(perfil.pwdChanged)}</div>
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

// Foto de perfil: se recorta al centro a 256 × 256 en el navegador (JPEG, unos 20 kB) antes de subirla
function FotoPerfil({ user, perfil, avisar }) {
  const [, setVersion] = useState(0)
  const [ocupado, setOcupado] = useState(false)
  async function subir(archivo) {
    if (!archivo) return
    setOcupado(true)
    try {
      const img = await createImageBitmap(archivo)
      const lado = Math.min(img.width, img.height)
      const lienzo = Object.assign(document.createElement('canvas'), { width: 256, height: 256 })
      lienzo.getContext('2d').drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, 256, 256)
      await api(`/api/perfil/${user.no}/foto`, { method: 'POST', body: { foto: lienzo.toDataURL('image/jpeg', 0.85) } })
      listo(t('Foto actualizada.'))
    } catch (e) {
      avisar(e.message || t('No se pudo leer la imagen.'))
    } finally {
      setOcupado(false)
    }
  }
  async function quitar() {
    try {
      await api(`/api/perfil/${user.no}/foto`, { method: 'DELETE' })
      listo(t('Foto quitada.'))
    } catch (e) {
      avisar(e.message)
    }
  }
  function listo(mensaje) {
    fotoCambiada()
    setVersion((v) => v + 1)
    avisar(mensaje)
  }
  return (
    <div className="foto-perfil">
      <Avatar no={perfil.no} name={perfil.name} className="lg" />
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
        <label className={`btn btn-secondary btn-sm${ocupado ? ' disabled' : ''}`}>
          <Icono nombre="upload" />{t(ocupado ? 'Subiendo…' : 'Cambiar foto')}
          <input type="file" accept="image/*" className="sr" disabled={ocupado} onChange={(e) => { subir(e.target.files[0]); e.target.value = '' }} />
        </label>
        <button type="button" className="btn btn-ghost btn-sm" onClick={quitar}>{t('Quitar foto')}</button>
      </div>
    </div>
  )
}
