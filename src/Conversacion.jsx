import { useCallback, useEffect, useRef, useState } from 'react'
import { api, criticidad, dia, fechaHora, nombreTurno } from './comun.js'
import Icono from './Icono.jsx'
import { Avatar, Estado } from './ui.jsx'
import { t } from './i18n.js'

// Panel de una actividad con su conversación (tipo chat): sus datos arriba, los mensajes en medio y el campo para
// escribir abajo. La ven y escriben quien la tiene, quien la asignó y sus encargados; a los demás les llega el aviso
export default function Conversacion({ a, user, cerrar }) {
  const ref = useRef(null)
  const fin = useRef(null)
  const [mensajes, setMensajes] = useState(null)
  const [texto, setTexto] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const cargar = useCallback(() => api(`/api/actividades/${a.id}/comentarios`).then(setMensajes).catch((e) => setError(e.message)), [a.id])
  useEffect(() => { ref.current.showModal(); cargar() }, [cargar])
  useEffect(() => { fin.current?.scrollIntoView({ block: 'end' }) }, [mensajes])

  async function enviar(e) {
    e?.preventDefault()
    if (!texto.trim()) return
    setEnviando(true)
    try {
      setMensajes(await api(`/api/actividades/${a.id}/comentarios`, { method: 'POST', body: { por: user.no, texto: texto.trim() } }))
      setTexto('')
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  const ultima = a.revisiones?.at(-1)
  return (
    <dialog ref={ref} className="card modal detalle conversacion" aria-labelledby="conv-titulo" onClose={cerrar}>
      <header className="row between" style={{ alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h2 id="conv-titulo" className="card-title" style={{ margin: 0 }}>{a.text}</h2>
          <div className="meta">
            {a.persona && <>{a.persona} · </>}<span className="mono">{dia(a.date)}</span> · {nombreTurno(a.shift)}
            {a.byName && <> · {t('Asignada por {nombre}', { nombre: a.byName })}</>}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => ref.current.close()}>{t('Cerrar')}</button>
      </header>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <Estado estado={a.status} />
        {a.prioridad === 'urgente' ? <span className="tag urgente">{t('Urgente')}</span> : <span className="tag crit" data-crit={a.criticidad ?? 'normal'}>{criticidad(a.criticidad ?? 'normal')}</span>}
        {a.cerrada && <span className="tag suave">{t('Cerrada con el turno')}</span>}
        {a.heredadaA && <span className="tag">{t('Heredada a {nombre}', { nombre: a.heredadaA })}</span>}
      </div>
      {(a.mgr || a.note || ultima || a.eliminada) && (
        <dl className="datos conv-datos">
          {a.mgr && <div><dt>{t('Comentario al asignar')}</dt><dd>{a.mgr}</dd></div>}
          {a.note && <div><dt>{t('Nota del empleado')}</dt><dd>{a.note}</dd></div>}
          {a.eliminada && <div><dt>{t('Eliminada')}</dt><dd>{a.eliminada.motivo} · {fechaHora(a.eliminada.at)}</dd></div>}
          {ultima && !a.eliminada && <div><dt>{t('Revisión')}</dt><dd>{t({ reabrir: 'Reabierta', cerrar: 'Dejada cerrada', eliminar: 'Eliminada' }[ultima.accion])}: {ultima.motivo}</dd></div>}
        </dl>
      )}

      <div className="conv-mensajes" aria-live="polite">
        {error && <p className="error" role="alert">{error}</p>}
        {!mensajes ? <p className="muted">{t('Cargando…')}</p>
          : !mensajes.length ? <p className="muted conv-vacia">{t('Sin comentarios todavía. Escribe el primero.')}</p>
          : mensajes.map((m, i) => (
            <div key={i} className={`conv-msg${m.por === user.no ? ' mio' : ''}`}>
              <Avatar no={m.por} name={m.name} />
              <div className="conv-burbuja">
                <div className="conv-quien"><b>{m.por === user.no ? t('Tú') : m.name}</b> <span className="muted">{fechaHora(m.at)}</span></div>
                <p>{m.texto}</p>
              </div>
            </div>
          ))}
        <span ref={fin} />
      </div>

      <form className="conv-escribir" onSubmit={enviar}>
        <textarea aria-label={t('Escribe un comentario')} placeholder={t('Escribe un comentario… (Ctrl + Enter para enviar)')} rows={2} maxLength={1000}
          value={texto} onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) enviar(e) }} />
        <button className="btn btn-primary" disabled={enviando || !texto.trim()} aria-label={t('Enviar')}><Icono nombre="flecha" />{t('Enviar')}</button>
      </form>
    </dialog>
  )
}
