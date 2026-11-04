import { useCallback, useEffect, useState } from 'react'
import { api, depto, registrarDeptos, rol } from './comun.js'
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
    </>
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
                    <td>{f.fila.shift}</td>
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
