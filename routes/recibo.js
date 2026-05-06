const express = require('express');
const router  = express.Router();
const db      = require('../db');
const PDFDocument = require('pdfkit');
const path    = require('path');
const fs      = require('fs');

const LOGO    = path.join(__dirname, '../public/img/logo.png');
const ROJO    = '#D92B2B';
const NEGRO   = '#1a1a1a';
const GRIS    = '#666666';
const GRIS2   = '#999999';
const LINEA   = '#e5e5e5';
const VERDE   = '#16a34a';
const AZUL    = '#2563eb';

function fmtM(n) {
  return '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtF(f) {
  if (!f) return '';
  const [y, m, d] = f.split('-');
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${parseInt(d)} de ${meses[parseInt(m)-1]} de ${y}`;
}
function fmtFCorta(f) {
  if (!f) return '';
  const [y, m, d] = f.split('-');
  return `${d}/${m}/${y}`;
}

// GET /api/recibo/:movId?concepto=...  → genera PDF
router.get('/:movId', (req, res) => {
  const mov = db.get('SELECT * FROM movimientos WHERE id=?', [req.params.movId]);
  if (!mov) return res.status(404).json({ error: 'No encontrado' });
  const cliente = db.get('SELECT * FROM clientes WHERE id=?', [mov.cliente_id]);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  const esCuotas = cliente.modalidad === 'cuotas';

  // Cuota número: contar cuántos abonos hubo hasta este movimiento
  let numeroCuota = 0;
  if (esCuotas) {
    const movsPrevios = db.query(
      'SELECT id FROM movimientos WHERE cliente_id=? AND abono=1 AND id<=? ORDER BY id ASC',
      [mov.cliente_id, mov.id]
    );
    numeroCuota = movsPrevios.length;
  }

  // Concepto editable — viene por query param
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const [y, m] = (mov.fecha || '').split('-');
  const mesLabel = m ? `${meses[parseInt(m)-1]} ${y}` : '';

  let conceptoDefault;
  if (esCuotas) {
    conceptoDefault = `Cuota ${numeroCuota} de ${cliente.total_cuotas} — ${cliente.auto_descripcion || ''}`;
  } else {
    conceptoDefault = `Corresponde a cuota del mes de ${mesLabel}`;
  }
  const concepto   = req.query.concepto ? decodeURIComponent(req.query.concepto) : conceptoDefault;
  const fechaManual = req.query.fecha    ? decodeURIComponent(req.query.fecha)    : fmtF(mov.fecha);

  const doc    = new PDFDocument({ size: 'A5', margin: 0 });
  const W      = doc.page.width;
  const H      = doc.page.height;
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  doc.on('end', () => {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="recibo-${mov.numero_recibo}.pdf"`);
    res.send(Buffer.concat(chunks));
  });

  // ── Franja roja superior
  doc.rect(0, 0, W, 70).fill(ROJO);

  // Logo
  if (fs.existsSync(LOGO)) {
    doc.image(LOGO, 18, 8, { height: 52 });
  }

  // RECIBO y número — derecha
  doc.fontSize(9).fillColor('rgba(255,255,255,.7)').font('Helvetica')
     .text('RECIBO', 0, 16, { align: 'right', width: W - 18 });
  doc.fontSize(20).fillColor('white').font('Helvetica-Bold')
     .text(`N° ${mov.numero_recibo}`, 0, 28, { align: 'right', width: W - 18 });

  // ── Cuerpo
  let posY = 85;

  // Fecha + Cliente en la misma zona
  doc.fontSize(8).fillColor(GRIS2).font('Helvetica').text('FECHA', 28, posY);
  doc.fontSize(8).fillColor(GRIS2).font('Helvetica').text('CLIENTE', W/2, posY);
  doc.fontSize(10).fillColor(NEGRO).font('Helvetica').text(fechaManual, 28, posY + 12);
  doc.fontSize(10).fillColor(NEGRO).font('Helvetica-Bold').text(cliente.nombre, W/2, posY + 12, { width: W/2 - 28 });

  if (cliente.dni) {
    doc.fontSize(8).fillColor(GRIS).font('Helvetica').text(`DNI: ${cliente.dni}`, W/2, posY + 26, { width: W/2 - 28 });
  }

  posY += 46;

  // Vehículo (si hay)
  if (cliente.auto_descripcion) {
    doc.moveTo(28, posY).lineTo(W - 28, posY).strokeColor(LINEA).lineWidth(0.5).stroke();
    posY += 10;
    doc.fontSize(8).fillColor(GRIS2).font('Helvetica').text('VEHÍCULO', 28, posY);
    doc.fontSize(10).fillColor(NEGRO).font('Helvetica').text(cliente.auto_descripcion, 28, posY + 12, { width: W - 56 });
    posY += 30;
  }

  // Línea separadora
  doc.moveTo(28, posY).lineTo(W - 28, posY).strokeColor(LINEA).lineWidth(0.5).stroke();
  posY += 12;

  // La suma de
  doc.fontSize(8).fillColor(GRIS2).font('Helvetica').text('ABONA LA SUMA DE', 28, posY);

  // Recuadro monto
  doc.rect(28, posY + 12, W - 56, 44).fill('#fff5f5').stroke(ROJO);
  doc.fontSize(24).fillColor(ROJO).font('Helvetica-Bold')
     .text(fmtM(mov.pago), 28, posY + 20, { align: 'center', width: W - 56 });

  posY += 70;

  // En concepto de
  doc.fontSize(8).fillColor(GRIS2).font('Helvetica').text('EN CONCEPTO DE', 28, posY);
  doc.fontSize(10).fillColor(NEGRO).font('Helvetica').text(concepto, 28, posY + 12, { width: W - 56 });

  posY += 36;

  // Detalle financiero
  doc.moveTo(28, posY).lineTo(W - 28, posY).strokeColor(LINEA).lineWidth(0.5).stroke();
  posY += 10;
  doc.fontSize(8).fillColor(GRIS2).font('Helvetica').text('DETALLE', 28, posY);
  posY += 14;

  function filaDet(label, valor, colorVal = NEGRO) {
    doc.fontSize(9).fillColor(GRIS).font('Helvetica').text(label, 28, posY);
    doc.fontSize(9).fillColor(colorVal).font('Helvetica-Bold')
       .text(valor, 0, posY, { align: 'right', width: W - 28 });
    posY += 15;
  }

  if (esCuotas) {
    filaDet('Monto abonado', fmtM(mov.pago), VERDE);
    filaDet('Cuota N°', `${numeroCuota} de ${cliente.total_cuotas}`, AZUL);
  } else {
    // Para interés mensual: monto abonado y saldo restante
    filaDet('Monto abonado', fmtM(mov.pago), VERDE);
    filaDet('Saldo restante', fmtM(mov.saldo_nuevo), mov.saldo_nuevo > 0 ? ROJO : VERDE);
  }

  if (mov.notas) {
    posY += 4;
    doc.fontSize(8).fillColor(GRIS2).font('Helvetica').text(`Notas: ${mov.notas}`, 28, posY, { width: W - 56 });
    posY += 14;
  }

  // ── Pie
  const yPie = H - 38;
  doc.rect(0, yPie, W, 38).fill('#f5f5f5');
  doc.moveTo(0, yPie).lineTo(W, yPie).strokeColor(LINEA).lineWidth(0.5).stroke();
  doc.fontSize(7.5).fillColor(GRIS2).font('Helvetica')
     .text('Yadon Automotores — Catamarca', 0, yPie + 8, { align: 'center' })
     .text(`Fecha: ${fechaManual}`, 0, yPie + 20, { align: 'center' });

  doc.end();
});

module.exports = router;