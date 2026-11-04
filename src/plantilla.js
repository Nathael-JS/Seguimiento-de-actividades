// Filas de la plantilla de departamento (Excel) → lo que espera POST /api/departamentos/:clave/plantilla.
// Aquí solo se revisa el formato de cada celda; las reglas entre personas (encargado, correos) las revisa el servidor
const normal = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

// Encabezados aceptados, en español o en inglés
const COLUMNAS = {
  no: ['numero', 'numero de empleado', 'no', 'no.', 'number', 'employee number'],
  name: ['nombre', 'name'],
  email: ['correo', 'correo electronico', 'email', 'e-mail'],
  role: ['puesto', 'role', 'position'],
  shift: ['turno', 'shift'],
  area: ['area'],
  boss: ['encargado', 'jefe', 'supervisor', 'manager'],
}
const PUESTOS = {
  tec: ['tecnico', 'technician', 'tec'],
  jr: ['ing. jr', 'ing jr', 'jr', 'jr. engineer', 'jr engineer'],
  full: ['ing. full', 'ing full', 'full', 'full engineer'],
  sr: ['senior', 'sr'],
}

export function filasDePlantilla(hoja) {
  const [encabezado = [], ...resto] = hoja
  const indice = Object.fromEntries(Object.entries(COLUMNAS).map(([k, nombres]) => [k, encabezado.findIndex((h) => nombres.includes(normal(h)))]))
  const faltan = Object.entries(indice).filter(([k, i]) => i < 0 && k !== 'area').map(([k]) => k)
  if (faltan.length) return { faltan, filas: [] }
  const filas = resto
    .map((celdas, i) => ({ celdas, renglon: i + 2 })) // el renglón como lo ve Excel (1 es el encabezado)
    .filter(({ celdas }) => celdas.some((c) => String(c ?? '').trim()))
    .map(({ celdas, renglon }) => {
      const valor = (k) => (indice[k] < 0 ? '' : String(celdas[indice[k]] ?? '').trim())
      const puesto = normal(valor('role'))
      const fila = {
        no: valor('no'), name: valor('name'), email: valor('email'),
        role: Object.keys(PUESTOS).find((k) => PUESTOS[k].includes(puesto)) ?? '',
        // Turno 1 a 4 (o A a D): se guarda con su clave interna
        shift: { 1: 'A', 2: 'B', 3: 'C', 4: 'D' }[valor('shift')] ?? valor('shift').toUpperCase(), area: valor('area'), boss: valor('boss'),
      }
      const error =
        !/^\d{4,10}$/.test(fila.no) ? 'Número de empleado inválido (4 a 10 dígitos).'
          : fila.name.length < 3 ? 'Falta el nombre.'
          : !/^\S+@\S+\.\S+$/.test(fila.email) ? 'Correo inválido.'
          : !fila.role ? 'Puesto desconocido: usa Técnico, Ing. Jr, Ing. Full o Senior.'
          : !['A', 'B', 'C', 'D'].includes(fila.shift) ? 'Turno inválido: 1, 2, 3 o 4.'
          : !/^\d{1,10}$/.test(fila.boss) ? 'Falta el número del encargado.'
          : null
      return { renglon, fila, error }
    })
  return { faltan, filas }
}
