import { TURNOS, depto, fechaHora } from './comun.js'
import Icono from './Icono.jsx'
import { t } from './i18n.js'
import { Anillo, AvisoPassword, Notificacion } from './ui.jsx'

export default function Inicio({ user, modulos, datos, error }) {
  return (
    <>
      <div className="page-head">
        <h1>{t('Hola, {nombre}', { nombre: user.name.split(' ')[0] })}</h1>
        <p>{t('Turno de hoy')}: {user.shift} · {TURNOS[user.shift]} · {depto(user.dept)}</p>
      </div>
      <AvisoPassword dias={datos?.diasPassword} enlace />

      {error ? <p className="error" role="alert">{error}</p> : !datos ? <p className="muted">{t('Cargando…')}</p> : (
        <>
          <section className="kpis">
            <Kpi n={datos.asignadas} label={t('Actividades asignadas')} />
            <Kpi n={datos.realizadas} label={t('Realizadas')} color="var(--status-done)" />
            <Kpi n={datos.abiertas} label={t('Pendientes o incompletas')} color="var(--status-pending)" />
            <div className="card kpi"><Anillo pct={datos.avance} /><div className="l">{t('Avance promedio')}</div></div>
          </section>

          <div className="cols">
            <section>
              <h2 className="card-title" style={{ marginBottom: 12 }}>{t('Accesos rápidos')}</h2>
              <div className="tiles">
                {modulos.filter((m) => m.desc).map((m) => (
                  <a key={m.ruta} className="card tile" href={`#${m.ruta}`}>
                    <span className="ic"><Icono nombre={m.icono} /></span>
                    <span><h3>{t(m.titulo)}</h3><p>{t(m.desc)}</p></span>
                  </a>
                ))}
              </div>
            </section>

            <section className="card">
              <div className="row between" style={{ marginBottom: 12 }}>
                <h2 className="card-title" style={{ margin: 0 }}>{t('Notificaciones recientes')}</h2>
                <a href="#buzon" style={{ fontSize: 13 }}>{t('Ver todas')}</a>
              </div>
              {datos.notificaciones.length ? (
                <ul className="list">
                  {datos.notificaciones.slice(0, 5).map((n) => (
                    <li key={n.id}>
                      <span className={`ndot ${n.kind}`} />
                      <div className={n.read ? '' : 'unread'}>
                        <Notificacion n={n} />
                        <div className="muted mono" style={{ fontSize: 12, fontWeight: 400 }}>{fechaHora(n.at)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="muted">{t('Sin notificaciones.')}</p>}
            </section>
          </div>
        </>
      )}
    </>
  )
}

function Kpi({ n, label, color }) {
  return (
    <div className="card kpi">
      <div><div className="n" style={{ color }}>{n}</div><div className="l">{label}</div></div>
    </div>
  )
}
