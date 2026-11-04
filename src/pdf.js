// Reporte en PDF (vista previa o descarga) con jsPDF + autotable. Solo se descarga al exportar (import dinámico
// desde Reportes): no pesa en la carga de la app
import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'

const MARCA = [11, 110, 110]
const TINTA = [22, 32, 42]
const SUAVE = [82, 96, 112]
const LINEA = [211, 218, 225]
const FONDO = [244, 246, 248]

// El logo de la app (public/favicon.svg) pasado a PNG para el encabezado; sin él, el PDF sale igual
async function logoPng() {
  try {
    const img = new Image()
    img.src = '/favicon.svg'
    await img.decode()
    const lienzo = Object.assign(document.createElement('canvas'), { width: 128, height: 128 })
    lienzo.getContext('2d').drawImage(img, 0, 0, 128, 128)
    return lienzo.toDataURL('image/png')
  } catch {
    return null
  }
}

// titulo, detalle (líneas bajo el título), resumen [[etiqueta, valor]], tablas [{ titulo, columnas, filas, colores? }]
// (colores(fila, columna) → [r, g, b] para resaltar, p. ej. el estado), pie: texto de cada página. Devuelve un Blob
export async function reportePdf({ titulo, detalle, resumen, tablas, pie }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })
  const ancho = doc.internal.pageSize.getWidth()
  const margen = 12

  // Encabezado: franja de la marca con el logo y el título
  doc.setFillColor(...MARCA)
  doc.rect(0, 0, ancho, 24, 'F')
  const logo = await logoPng()
  if (logo) doc.addImage(logo, 'PNG', margen, 5, 14, 14)
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold').setFontSize(16)
  doc.text(titulo, margen + (logo ? 18 : 0), 13)
  doc.setFont('helvetica', 'normal').setFontSize(9)
  doc.text(detalle.join('   ·   '), margen + (logo ? 18 : 0), 19)

  // Resumen en recuadros
  let y = 31
  const caja = (ancho - margen * 2 - (resumen.length - 1) * 4) / resumen.length
  resumen.forEach(([etiqueta, valor], i) => {
    const x = margen + i * (caja + 4)
    doc.setFillColor(...FONDO).setDrawColor(...LINEA).roundedRect(x, y, caja, 16, 2, 2, 'FD')
    doc.setTextColor(...TINTA).setFont('helvetica', 'bold').setFontSize(14).text(String(valor), x + 4, y + 8)
    doc.setTextColor(...SUAVE).setFont('helvetica', 'normal').setFontSize(8).text(etiqueta, x + 4, y + 13)
  })
  y += 24

  for (const tabla of tablas) {
    doc.setTextColor(...TINTA).setFont('helvetica', 'bold').setFontSize(11).text(tabla.titulo, margen, y)
    autoTable(doc, {
      startY: y + 3,
      margin: { left: margen, right: margen, bottom: 16 },
      head: [tabla.columnas],
      body: tabla.filas,
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.8, textColor: TINTA, lineColor: LINEA, lineWidth: 0.1, overflow: 'linebreak' },
      headStyles: { fillColor: MARCA, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: FONDO },
      didParseCell: (c) => {
        const color = c.section === 'body' && tabla.colores?.(c.row.index, c.column.index)
        if (color) Object.assign(c.cell.styles, { textColor: color, fontStyle: 'bold' })
      },
    })
    y = doc.lastAutoTable.finalY + 10
  }

  // Pie en cada página: quién y cuándo, y el número de página
  const paginas = doc.internal.getNumberOfPages()
  const alto = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    doc.setDrawColor(...LINEA).line(margen, alto - 11, ancho - margen, alto - 11)
    doc.setTextColor(...SUAVE).setFont('helvetica', 'normal').setFontSize(8)
    doc.text(pie, margen, alto - 6)
    doc.text(`${i} / ${paginas}`, ancho - margen, alto - 6, { align: 'right' })
  }
  return doc.output('blob')
}
