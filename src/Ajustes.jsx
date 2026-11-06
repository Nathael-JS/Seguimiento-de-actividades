import { useCallback, useEffect, useState } from 'react'
import { TURNOS, api, depto, lidera, registrarDeptos, rol, turnoLargo } from './comun.js'
import Icono from './Icono.jsx'
import { filasDePlantilla } from './plantilla.js'
import { t } from './i18n.js'

// Ajustes del gerente: los departamentos que dirige, crear uno nuevo y cargar la plantilla de su gente
export default function Ajustes({ user, avisar }) {
  const [deptos, setDeptos] = useState(null)
  const [personas, setPersonas] = useState([])
  const [error, setError] = useState('')

  const cargar = useCallback(() => Promise.all([api('/api/deptos'), api('/api/departamentos')])
    .then(([d, p]) => { registrarDeptos(d); setDeptos(d.filter((x) => x.clave === user.dept || x.gerente === user.no)); setPersonas(p) })
    .catch((e) => setError(e.message)), [user.dept, user.no])
  useEffect(() => { cargar() }, [cargar])

  if (error) return <p className="error" role="alert">{error}</p>
  if (!deptos) return <p className="muted">{t('Cargando…')}</p>

  return (
    <>
      <div className="page-head">
        <h1>{t('Ajustes')}</h1>
        <p>{t('Los departamentos que diriges: crea uno nuevo o carga la plantilla de su gente desde Excel.')}</p>
      </div>
      <div className="ajustes">
        <section className="card">
          <h2 className="card-title">{t('Tus departamentos')}</h2>
          <ul className="list deptos-lista">
            {deptos.map((d) => (
              <FilaDepto key={d.clave} d={d} user={user} n={personas.filter((p) => p.dept === d.clave).length} avisar={avisar} alCambiar={cargar} />
            ))}
          </ul>
          <NuevoDepto user={user} alCrear={(d) => { avisar(t('Departamento {nombre} creado. Ya lo diriges.', { nombre: d.nombre })); cargar() }} />
        </section>
        <Plantilla user={user} deptos={deptos} alCargar={cargar} avisar={avisar} />
      </div>
      <VerPlantilla user={user} deptos={deptos} personas={personas} alCambiar={cargar} avisar={avisar} />
    </>
  )
}

// La plantilla cargada de cada departamento: se ve, se agrega una persona que faltó y se corrige a cualquiera.
// Va por la misma carga de plantilla (una fila): mismas reglas y validaciones que el Excel
function VerPlantilla({ user, deptos, personas, alCambiar, avisar }) {
  const [clave, setClave] = useState(deptos[0]?.clave)
  const [editando, setEditando] = useState(null) // null, 'nueva' o la persona
  if (!clave) return null
  const lista = personas.filter((p) => p.dept === clave && p.no !== user.no)
  return (
    <section className="card plantilla-vista">
      <div className="row between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <h2 className="card-title" style={{ margin: 0 }}>{t('Plantilla del departamento')}</h2>
        <div className="row" style={{ gap: 8 }}>
          {deptos.length > 1 && (
            <select aria-label={t('Departamento')} value={clave} onChange={(e) => { setClave(e.target.value); setEditando(null) }}>
              {deptos.map((d) => <option key={d.clave} value={d.clave}>{depto(d.clave)}</option>)}
            </select>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => setEditando('nueva')}><Icono nombre="plus" />{t('Agregar persona')}</button>
        </div>
      </div>
      {editando && (
        <FormPersona key={editando === 'nueva' ? 'nueva' : editando.no} p={editando === 'nueva' ? null : editando} clave={clave} user={user} lista={lista}
          cerrar={() => setEditando(null)}
          alGuardar={(r, nombre) => {
            setEditando(null)
            alCambiar()
            avisar(r.creados ? t('{nombre} quedó en la plantilla por registrar: ya puede crear su cuenta.', { nombre }) : t('Datos de {nombre} actualizados.', { nombre }))
          }} />
      )}
      {lista.length ? (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>{['Número', 'Nombre', 'Puesto', 'Turno', 'Encargado', 'Estado', ''].map((c, i) => <th key={i} scope="col">{c && t(c)}</th>)}</tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.no}>
                  <td className="mono">{p.no}</td>
                  <td>{p.name}<div className="muted" style={{ fontSize: 12 }}>{p.email}</div></td>
                  <td>{rol(p.role)}</td>
                  <td>{turnoLargo(p.shift)}</td>
                  <td>{p.boss === user.no ? t('Tú') : personas.find((x) => x.no === p.boss)?.name ?? '—'}</td>
                  <td>{p.porRegistrar ? <span className="tag">{t('Por registrar')}</span> : <span className="tag suave">{t('Registrada')}</span>}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => setEditando(p)} aria-label={t('Editar a {nombre}', { nombre: p.name })}><Icono nombre="edit" />{t('Editar')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="muted" style={{ marginTop: 12 }}>{t('Todavía no hay personas en la plantilla de este departamento.')}</p>}
    </section>
  )
}

// Alta o corrección de una persona de la plantilla. El encargado se elige entre quienes pueden tenerla a su cargo
function FormPersona({ p, clave, user, lista, cerrar, alGuardar }) {
  const [d, setD] = useState({ no: p?.no ?? '', name: p?.name ?? '', email: p?.email ?? '', role: p?.role ?? 'tec', shift: p?.shift ?? 'A', area: p?.area ?? '', boss: p?.boss ?? user.no })
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value })
  const encargados = [{ no: user.no, name: t('Tú'), role: user.role }, ...lista.filter((x) => x.no !== d.no)].filter((x) => lidera(x.role, d.role))
  async function guardar(e) {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      const r = await api(`/api/departamentos/${clave}/plantilla`, { method: 'POST', body: { por: user.no, filas: [{ ...d, no: d.no.trim() }] } })
      alGuardar(r, d.name.trim())
    } catch (err) {
      // La carga de plantilla responde el error de la fila, no uno general
      setError(err.datos?.filas?.[0]?.error ? t(err.datos.filas[0].error) : err.message)
      setEnviando(false)
    }
  }
  return (
    <form className="form-persona" onSubmit={guardar}>
      <h3>{p ? t('Editar a {nombre}', { nombre: p.name }) : t('Agregar persona')}</h3>
      <div className="campos">
        <label className="field"><span>{t('Número de empleado')}</span><input inputMode="numeric" maxLength={10} required value={d.no} disabled={!!p} onChange={set('no')} /></label>
        <label className="field"><span>{t('Nombre completo')}</span><input maxLength={100} required value={d.name} onChange={set('name')} /></label>
        <label className="field"><span>{t('Correo electrónico')}</span><input type="email" maxLength={100} required value={d.email} onChange={set('email')} /></label>
        <label className="field"><span>{t('Puesto')}</span>
          <select value={d.role} onChange={(e) => setD({ ...d, role: e.target.value, boss: user.no })}>
            {['tec', 'jr', 'full', 'sr'].map((r) => <option key={r} value={r}>{rol(r)}</option>)}
          </select>
        </label>
        <label className="field"><span>{t('Turno')}</span>
          <select value={d.shift} onChange={set('shift')}>{Object.keys(TURNOS).map((k) => <option key={k} value={k}>{turnoLargo(k)}</option>)}</select>
        </label>
        <label className="field"><span>{t('Encargado')}</span>
          <select value={d.boss} onChange={set('boss')}>{encargados.map((x) => <option key={x.no} value={x.no}>{x.name}{x.no !== user.no ? ` · ${rol(x.role)}` : ''}</option>)}</select>
        </label>
        <label className="field"><span>{t('Área')} <small className="muted">({t('opcional')})</small></span><input maxLength={60} value={d.area} onChange={set('area')} /></label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row end" style={{ gap: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={cerrar}>{t('Cancelar')}</button>
        <button className="btn btn-primary" disabled={enviando}>{t(p ? 'Guardar cambios' : 'Agregar a la plantilla')}</button>
      </div>
    </form>
  )
}

// Un departamento de la lista: el gerente que lo dirige le cambia el nombre o lo borra (vacío y que no sea el suyo)
function FilaDepto({ d, user, n, avisar, alCambiar }) {
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(depto(d.clave))
  const [borrar, setBorrar] = useState(false)
  const propio = d.gerente === user.no
  async function hacer(peticion, mensaje) {
    try {
      await peticion
      avisar(mensaje)
      setEditando(false)
      setBorrar(false)
      alCambiar()
    } catch (e) {
      avisar(e.message)
    }
  }
  const guardar = (e) => {
    e.preventDefault()
    hacer(api(`/api/departamentos/${d.clave}`, { method: 'PATCH', body: { por: user.no, nombre: nombre.trim() } }), t('Departamento renombrado.'))
  }
  if (editando) {
    return (
      <li>
        <form className="row" style={{ flex: 1, gap: 8, flexWrap: 'wrap' }} onSubmit={guardar}>
          <input className="input-linea" aria-label={t('Nombre del departamento')} minLength={3} maxLength={60} value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
          <button className="btn btn-primary btn-sm" type="submit" disabled={nombre.trim().length < 3}>{t('Guardar')}</button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditando(false)}>{t('Cancelar')}</button>
        </form>
      </li>
    )
  }
  return (
    <li>
      <b style={{ flex: 1 }}>{depto(d.clave)}</b>
      <span className="muted">{t(n === 1 ? '{n} persona' : '{n} personas', { n })}</span>
      {propio && (borrar ? (
        <span className="row" style={{ gap: 6 }}>
          <button className="btn btn-danger btn-sm" onClick={() => hacer(api(`/api/departamentos/${d.clave}`, { method: 'DELETE', body: { por: user.no } }), t('Departamento borrado.'))}>{t('Sí, borrar')}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setBorrar(false)}>{t('Cancelar')}</button>
        </span>
      ) : (
        <span className="row" style={{ gap: 4 }}>
          <button className="iconbtn" aria-label={t('Editar {nombre}', { nombre: depto(d.clave) })} title={t('Editar')} onClick={() => setEditando(true)}><Icono nombre="edit" /></button>
          {/* Con personas no se puede borrar: el servidor lo explica, pero aquí ya se ve */}
          <button className="iconbtn" aria-label={t('Borrar {nombre}', { nombre: depto(d.clave) })} title={n ? t('Tiene personas: no se puede borrar') : t('Borrar')} disabled={n > 0} onClick={() => setBorrar(true)}><Icono nombre="trash" /></button>
        </span>
      ))}
    </li>
  )
}

function NuevoDepto({ user, alCrear }) {
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function crear(e) {
    e.preventDefault()
    if (nombre.trim().length < 3) return setError(t('Escribe el nombre del departamento (3 letras o más).'))
    setError('')
    setEnviando(true)
    try {
      const d = await api('/api/departamentos', { method: 'POST', body: { por: user.no, nombre: nombre.trim() } })
      setNombre('')
      alCrear(d)
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="nuevo-depto" onSubmit={crear} noValidate>
      <label className="field">
        <span>{t('Crear departamento')}</span>
        <input value={nombre} maxLength={60} placeholder={t('Ej. Calidad de Proceso')} onChange={(e) => setNombre(e.target.value)} />
        <small>{t('Lo diriges tú; después carga su plantilla.')}</small>
      </label>
      <button className="btn btn-primary" type="submit" disabled={enviando}>{t(enviando ? 'Creando…' : 'Crear')}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  )
}

function Plantilla({ user, deptos, alCargar, avisar }) {
  const [clave, setClave] = useState(deptos[0].clave)
  const [archivo, setArchivo] = useState('')
  const [revision, setRevision] = useState(null) // [{ renglon, fila, error, accion }]
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  // Revisa el archivo: primero el formato de cada celda (aquí) y luego las reglas del departamento (servidor)
  async function revisar(file, destino = clave) {
    setError('')
    setRevision(null)
    if (!file) return
    setArchivo(file.name)
    let hoja
    try {
      const { readSheet } = await import('read-excel-file/browser') // solo al subir un Excel
      hoja = await readSheet(file)
    } catch {
      return setError(t('No se pudo leer el archivo. ¿Es un Excel (.xlsx)?'))
    }
    try {
      const { faltan, filas } = filasDePlantilla(hoja)
      if (faltan.length) return setError(t('Al archivo le faltan columnas. Usa la plantilla de ejemplo.'))
      if (!filas.length) return setError(t('La plantilla no tiene personas.'))
      const validas = filas.filter((f) => !f.error)
      const servidor = validas.length
        ? await api(`/api/departamentos/${destino}/plantilla`, { method: 'POST', body: { por: user.no, filas: validas.map((f) => f.fila), soloRevisar: true } })
        : { filas: [] }
      const delServidor = new Map(servidor.filas.map((r) => [r.no, r]))
      setRevision(filas.map((f) => ({ ...f, accion: delServidor.get(f.fila.no)?.accion, error: f.error ?? delServidor.get(f.fila.no)?.error })))
    } catch (e) {
      setError(e.message)
    }
  }

  async function importar() {
    setEnviando(true)
    setError('')
    try {
      const r = await api(`/api/departamentos/${clave}/plantilla`, { method: 'POST', body: { por: user.no, filas: revision.map((f) => f.fila) } })
      avisar(t('Plantilla cargada: {creados} nuevas, {actualizados} actualizadas.', { creados: r.creados, actualizados: r.actualizados }))
      setRevision(null)
      setArchivo('')
      alCargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setEnviando(false)
    }
  }

  const conError = revision?.filter((f) => f.error).length ?? 0

  return (
    <section className="card plantilla">
      <div className="row between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <h2 className="card-title" style={{ margin: 0 }}>{t('Cargar plantilla')}</h2>
        <a className="btn btn-ghost btn-sm" href="/plantilla-departamento.xlsx" download>{t('Descargar ejemplo (.xlsx)')}</a>
      </div>
      <p className="muted" style={{ fontSize: 14 }}>{t('Una fila por persona: número, nombre, correo, puesto, turno, área y su encargado. Quien ya existe se actualiza; cada persona nueva se registra con su número y correo (Crear cuenta).')}</p>

      <label className="field">
        <span>{t('Departamento')}</span>
        <select value={clave} onChange={(e) => { setClave(e.target.value); setRevision(null); setArchivo('') }}>
          {deptos.map((d) => <option key={d.clave} value={d.clave}>{depto(d.clave)}</option>)}
        </select>
      </label>

      <label className="soltar">
        <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => { revisar(e.target.files[0]); e.target.value = '' }} />
        <Icono nombre="upload" />
        <span><b>{archivo || t('Elige el archivo de Excel')}</b><small>{t('Solo .xlsx; se lee la primera hoja.')}</small></span>
      </label>
      {error && <p className="error" role="alert">{error}</p>}

      {revision && (
        <>
          <p className={conError ? 'error' : 'muted'} role="status">
            {conError
              ? t('{n} filas con error: corrígelas en el Excel y vuelve a cargarlo. No se guardó nada.', { n: conError })
              : t('{n} personas listas para cargar en {departamento}.', { n: revision.length, departamento: depto(clave) })}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>{['Fila', 'Número', 'Nombre', 'Puesto', 'Turno', 'Encargado', 'Resultado'].map((c) => <th key={c} scope="col">{t(c)}</th>)}</tr>
              </thead>
              <tbody>
                {revision.map((f) => (
                  <tr key={f.renglon} className={f.error ? 'con-error' : ''}>
                    <td className="mono">{f.renglon}</td>
                    <td className="mono">{f.fila.no}</td>
                    <td>{f.fila.name}</td>
                    <td>{f.fila.role ? rol(f.fila.role) : '—'}</td>
                    <td>{turnoLargo(f.fila.shift)}</td>
                    <td className="mono">{f.fila.boss}</td>
                    <td>{f.error ? <span className="txt-incompleta">{t(f.error)}</span> : t(f.accion === 'crear' ? 'Nueva' : 'Se actualiza')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row end">
            <button className="btn btn-primary" onClick={importar} disabled={enviando || conError > 0}>
              {t(enviando ? 'Cargando…' : 'Cargar {n} personas', { n: revision.length })}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
