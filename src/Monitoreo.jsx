import { useEffect, useRef, useState } from 'react'
import Icono from './Icono.jsx'
import { api, consultaRate, dia, esEncargado, hora, hoy, inicioDeHoy, nombreTurno, pctRealizadas, rol } from './comun.js'
import { t } from './i18n.js'
import { Anillo, Avatar, Criticidad, Estado, Rate } from './ui.jsx'
import { ListaActividades, PorcentajeRealizadas } from './Lista.jsx'

// % realizadas; null sin actividades (el anillo muestra "—")
const conAvance = (acts) => (acts.length ? pctRealizadas(acts) : null)

export default function Monitoreo({ user }) {
  const [equipo, setEquipo] = useState(null)
  const [error, setError] = useState('')
  // 'todos', 'directos' o el número de un líder: él y quienes le reportan directo.
  // #monitoreo?lider=N (desde el Inicio del gerente) abre con ese líder elegido
  const consulta = new URLSearchParams(location.hash.split('?')[1])
  const [filtro, setFiltro] = useState(() => consulta.get('lider') ?? 'todos')
  // #monitoreo?empleado=N (desde Jerarquía) abre directo sus actividades
  const [elegido, setElegido] = useState(() => consulta.get('empleado'))
  const [puesto, setPuesto] = useState('') // '' = todos los puestos
  // Lista (por defecto) o tarjetas por persona; se recuerda en el navegador
  const [vista, setVista] = useState(() => { try { return localStorage.getItem('monitoreo-vista') ?? 'lista' } catch { return 'lista' } })
  const elegirVista = (v) => { setVista(v); try { localStorage.setItem('monitoreo-vista', v) } catch { /* solo esta vez */ } }

  useEffect(() => {
    api(`/api/equipo/${user.no}?desde=${encodeURIComponent(inicioDeHoy())}&${consultaRate()}`).then(setEquipo).catch((e) => setError(e.message))
  }, [user.no])

  if (error) return <p className="error" role="alert">{error}</p>
  if (!equipo) return <p className="muted">{t('Cargando…')}</p>

  const nombres = Object.fromEntries([[user.no, user.name], ...equipo.map((e) => [e.no, e.name])])
  const lideres = equipo.filter((e) => esEncargado(e.role))
  // Un líder elegido: él, quienes le reportan directo y sus ayudantes
  const delLider = (e) => e.no === filtro || e.boss === filtro || equipo.find((l) => l.no === filtro)?.ayudantes?.includes(e.no)
  const visibles = equipo.filter((e) => (!puesto || e.role === puesto) &&
    (filtro === 'todos' || (filtro === 'directos' ? e.boss === user.no : delLider(e))))
  // Solo los puestos que hay en su gente
  const puestos = ['gte', 'sr', 'full', 'jr', 'tec'].filter((r) => equipo.some((e) => e.role === r))

  return (
    <>
      <div className="page-head row between" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <h1>{t('Monitoreo')}</h1>
          <p>{t('Empleados a tu cargo: actividades abiertas y realizadas hoy.')}</p>
        </div>
        <PorcentajeRealizadas grupos={visibles.map((e) => ({ no: e.no, name: e.name, acts: e.actividades }))} />
      </div>

      <div className="row between barra-vista">
      <div className="chips" role="group" aria-label={t('Filtrar equipo')}>
        <button aria-pressed={filtro === 'todos'} onClick={() => setFiltro('todos')}>{t('Todos')} ({equipo.length})</button>
        <button aria-pressed={filtro === 'directos'} onClick={() => setFiltro('directos')}>{t('Directos')}</button>
        {lideres.map((l) => (
          <button key={l.no} aria-pressed={filtro === l.no} onClick={() => setFiltro(l.no)}>
            {l.name.split(' ')[0]} · {rol(l.role)}
          </button>
        ))}
      </div>
      <label className="puesto-filtro">
        <span className="sr">{t('Puesto')}</span>
        <select value={puesto} onChange={(e) => setPuesto(e.target.value)}>
          <option value="">{t('Todos los puestos')}</option>
          {puestos.map((r) => <option key={r} value={r}>{rol(r)} ({equipo.filter((e) => e.role === r).length})</option>)}
        </select>
      </label>
      <div className="segmento" role="group" aria-label={t('Vista')}>
        <button aria-pressed={vista === 'lista'} onClick={() => elegirVista('lista')}><Icono nombre="list" />{t('Lista')}</button>
        <button aria-pressed={vista === 'tarjetas'} onClick={() => elegirVista('tarjetas')}><Icono nombre="grid" />{t('Tarjetas')}</button>
      </div>
      </div>

      {vista === 'lista' ? (
        <ListaActividades conPersona nombres={nombres}
          filas={visibles.flatMap((e) => e.actividades.map((a) => ({ ...a, persona: e.name })))} />
      ) : visibles.length ? (
        <div className="emp-grid">
          {visibles.map((e) => (
            <article key={e.no} className="card emp-card">
              <header>
                <Avatar no={e.no} name={e.name} />
                <div className="who">
                  <h3><button className="enlace" onClick={() => setElegido(e.no)} aria-haspopup="dialog">{e.name}</button></h3>
                  <div className="meta meta-sm">{rol(e.role)} · <span className="mono">{e.no}</span> · <span className="nowrap">{nombreTurno(e.shift)}</span></div>
                  <div className="tree">↳ {nombres[e.boss] ?? '—'}</div>
                </div>
                <Anillo pct={conAvance(e.actividades)} size={72} width={8} />
              </header>
              <div className="rate-mini"><span>{t('Rate de aprobación')}</span> <Rate valor={e.rate} /></div>
              {e.actividades.length ? (
                <ul className="mini">
                  {e.actividades.map((a) => (
                    <li key={a.id}>
                      <span title={a.text}>{a.text}</span>
                      <span className="row" style={{ gap: 8, flex: 'none' }}>
                        {a.prioridad === 'urgente' && <span className="tag urgente">{t('Urgente')}</span>}
                        <Criticidad valor={a.criticidad} />
                        <Estado estado={a.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <p className="meta">{t('Sin actividades.')}</p>}
            </article>
          ))}
        </div>
      ) : <section className="card empty">{t('No hay empleados en este filtro.')}</section>}

      {elegido && equipo.some((e) => e.no === elegido) && (
        <Detalle user={user} emp={equipo.find((e) => e.no === elegido)} cerrar={() => setElegido(null)} />
      )}
    </>
  )
}

const DIAS_DETALLE = 30
const fechaMas = (n) => new Date(Date.now() + n * 86_400_000).toLocaleDateString('en-CA')

// Todas las actividades asignadas a un empleado: las de los últimos 30 días y las ya programadas
function Detalle({ user, emp, cerrar }) {
  const ref = useRef()
  const [acts, setActs] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    ref.current.showModal()
    api('/api/reportes', { method: 'POST', body: { por: user.no, empleados: [emp.no], desde: fechaMas(-DIAS_DETALLE), hasta: fechaMas(DIAS_DETALLE) } })
      .then(setActs).catch((e) => setError(e.message))
  }, [user.no, emp.no])

  const dias = []
  for (const a of acts ?? []) {
    if (dias.at(-1)?.[0] !== a.date) dias.push([a.date, []])
    dias.at(-1)[1].push(a)
  }

  return (
    <dialog ref={ref} className="card modal detalle" aria-labelledby="detalle-titulo" onClose={cerrar}>
      <header className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="row" style={{ gap: 12 }}>
          <Avatar no={emp.no} name={emp.name} />
          <div>
            <h2 id="detalle-titulo" className="card-title" style={{ margin: 0 }}>{emp.name}</h2>
            <div className="meta">{rol(emp.role)} · <span className="mono">{emp.no}</span> · {nombreTurno(emp.shift)}</div>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => ref.current.close()} autoFocus>{t('Cerrar')}</button>
      </header>
      <p className="meta">{t('Actividades asignadas de los últimos {n} días y las ya programadas.', { n: DIAS_DETALLE })}</p>
      <div className="detalle-lista">
        {error ? <p className="error" role="alert">{error}</p>
          : !acts ? <p className="muted">{t('Cargando…')}</p>
          : !acts.length ? <p className="empty">{t('Sin actividades en este periodo.')}</p>
          : dias.map(([fecha, lista]) => (
            <section key={fecha}>
              <h3>{fecha === hoy() ? t('Hoy') : dia(fecha)}</h3>
              <ul className="mini">
                {lista.map((a) => (
                  <li key={a.id}>
                    <span>
                      {a.text}
                      <small className="muted">
                        {nombreTurno(a.shift)} · {hora(a.at)}
                        {a.heredadaA && <> · {t('Heredada a {nombre}', { nombre: a.heredadaA })}</>}
                        {a.note && <> · “{a.note}”</>}
                      </small>
                    </span>
                    <span className="row" style={{ gap: 8, flex: 'none' }}>
                      {a.prioridad === 'urgente' && <span className="tag urgente">{t('Urgente')}</span>}
                      <Criticidad valor={a.criticidad} />
                      <Estado estado={a.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
    </dialog>
  )
}
