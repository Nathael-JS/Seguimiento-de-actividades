import { RANGOS, TURNOS, turnoLargo } from './comun.js'
import { t } from './i18n.js'

// Reloj de 24 h con los tres turnos rotativos como arcos y el administrativo (4) por dentro, porque se cruza con ellos.
// La aguja gira a `hora` (0–24) y el turno `activo` se ensancha
const C = 200
const R = 150
const punto = (h, r = R) => {
  const a = ((h / 24) * 360 - 90) * (Math.PI / 180)
  return [C + r * Math.cos(a), C + r * Math.sin(a)]
}
const arco = (h1, h2, r = R) => {
  const [x1, y1] = punto(h1, r)
  const [x2, y2] = punto(h2, r)
  return `M${x1} ${y1} A${r} ${r} 0 ${h2 - h1 > 12 ? 1 : 0} 1 ${x2} ${y2}`
}
const horas = (txt) => { const [h, m] = txt.split(':').map(Number); return h + m / 60 }
const ADMIN = TURNOS.D.split('–').map(horas)
export default function Dial({ hora, activo, giros = 0, className = '' }) {
  return (
    <svg className={`dial ${className}`} viewBox="0 0 400 400" role="img"
      aria-label={t('Reloj de 24 horas: {turno}, {horas}', { turno: turnoLargo(activo), horas: TURNOS[activo] })}>
      <circle className="dial-base" cx={C} cy={C} r={R} />
      {Array.from({ length: 24 }, (_, h) => {
        const [x1, y1] = punto(h, R + 22)
        const [x2, y2] = punto(h, R + (h % 6 ? 28 : 34))
        return <line key={h} className={`dial-tick${h % 6 ? '' : ' mayor'}`} x1={x1} y1={y1} x2={x2} y2={y2} />
      })}
      {[0, 6, 12, 18].map((h) => {
        const [x, y] = punto(h, R + 52)
        return <text key={h} className="dial-hora" x={x} y={y}>{String(h).padStart(2, '0')}</text>
      })}
      {Object.entries(RANGOS).map(([k, [a, b]]) => (
        <path key={k} className={`dial-turno t-${k}${k === activo ? ' activo' : ''}`} d={arco(a + 0.12, b - 0.12)} />
      ))}
      <path className="dial-turno t-D" d={arco(ADMIN[0] + 0.12, ADMIN[1] - 0.12, R - 24)} />
      {/* giros: vueltas completas extra para que la aguja siempre avance en el sentido del reloj */}
      <g className="dial-aguja" style={{ transform: `rotate(${(hora / 24) * 360 + giros * 360}deg)` }}>
        <line x1={C} y1={C} x2={C} y2={C - R + 18} />
        <circle cx={C} cy={C - R + 18} r="7" />
      </g>
      <circle className="dial-eje" cx={C} cy={C} r="6" />
    </svg>
  )
}
