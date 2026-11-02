import { TURNOS, depto } from './comun.js'
import Icono from './Icono.jsx'
import TableroGerente from './TableroGerente.jsx'
import { t } from './i18n.js'
import { Anillo, AvisoPassword, NotificacionesRecientes } from './ui.jsx'

export default function Inicio({ user, modulos, datos, error, recargar }) {
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
            <Kpi n={datos.asignadas} label={t('Abiertas y realizadas hoy')} />
            <Kpi n={datos.realizadas} label={t('Realizadas hoy')} color="var(--status-done)" />
            <Kpi n={datos.abiertas} label={t('Pendientes o incompletas')} color="var(--status-pending)" />
            <div className="card kpi"><Anillo pct={datos.avance} /><div className="l">{t('Avance promedio')}</div></div>
          </section>

          {/* El gerente ve el tablero de su área; los demás, sus accesos rápidos */}
          {user.role === 'gte' ? <TableroGerente user={user} notificaciones={datos.notificaciones} recargar={recargar} /> : (
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

              <NotificacionesRecientes user={user} notificaciones={datos.notificaciones} recargar={recargar} />
            </div>
          )}
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
