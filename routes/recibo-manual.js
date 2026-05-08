const express = require('express');
const router  = express.Router();
const PDFDocument = require('pdfkit');
const path    = require('path');
const fs      = require('fs');

const LOGO  = path.join(__dirname, '../public/img/logo.png');
const ROJO  = '#D92B2B';
const NEGRO = '#1a2744';
const GRIS  = '#666666';
const GRIS2 = '#999999';
const LINEA = '#e5e5e5';
const VERDE = '#16a34a';
const AZUL  = '#2563eb';

function fmtM(n) {
  const num = parseFloat(n);
  if (!num || isNaN(num)) return '';
  return '$' + num.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

router.get('/', (req, res) => {
  const { cliente, vehiculo, fecha, concepto, monto, saldo, notas, numero } = req.query;

  const doc    = new PDFDocument({ size: 'A5', margin: 0 });
  const W      = doc.page.width;
  const H      = doc.page.height;
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  doc.on('end', () => {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="recibo-manual.pdf"`);
    res.send(Buffer.concat(chunks));
  });

  // ── Franja roja superior
  doc.rect(0, 0, W, 70).fill(ROJO);
  if (fs.existsSync(LOGO)) doc.image(LOGO, 18, 8, { height: 52 });

  doc.fontSize(9).fillColor('rgba(255,255,255,.7)').font('Helvetica')
     .text('RECIBO', 0, 16, { align: 'right', width: W - 18 });
  doc.fontSize(20).fillColor('white').font('Helvetica-Bold')
     .text(numero ? `N° ${numero}` : 'RECIBO', 0, 28, { align: 'right', width: W - 18 });

  // ── Cuerpo
  let posY = 85;

  // Fecha + Cliente
  doc.fontSize(8).fillColor(GRIS2).font('Helvetica').text('FECHA', 28, posY);
  doc.fontSize(8).fillColor(GRIS2).font('Helvetica').text('CLIENTE', W/2, posY);
  doc.fontSize(10).fillColor(NEGRO).font('Helvetica').text(fecha || '—', 28, posY + 12);
  doc.fontSize(10).fillColor(NEGRO).font('Helvetica-Bold').text(cliente || '—', W/2, posY + 12, { width: W/2 - 28 });
  posY += 46;

  // Vehículo
  if (vehiculo) {
    doc.moveTo(28, posY).lineTo(W - 28, posY).strokeColor(LINEA).lineWidth(0.5).stroke();
    posY += 10;
    doc.fontSize(8).fillColor(GRIS2).font('Helvetica').text('VEHÍCULO', 28, posY);
    doc.fontSize(10).fillColor(NEGRO).font('Helvetica').text(vehiculo, 28, posY + 12, { width: W - 56 });
    posY += 30;
  }

  // Línea
  doc.moveTo(28, posY).lineTo(W - 28, posY).strokeColor(LINEA).lineWidth(0.5).stroke();
  posY += 12;

  // Monto
  doc.fontSize(8).fillColor(GRIS2).font('Helvetica').text('ABONA LA SUMA DE', 28, posY);
  doc.rect(28, posY + 12, W - 56, 44).fill('#fff5f5').stroke(ROJO);
  doc.fontSize(24).fillColor(ROJO).font('Helvetica-Bold')
     .text(fmtM(monto) || '—', 28, posY + 20, { align: 'center', width: W - 56 });
  posY += 70;

  // Concepto
  if (concepto) {
    doc.fontSize(8).fillColor(GRIS2).font('Helvetica').text('EN CONCEPTO DE', 28, posY);
    doc.fontSize(10).fillColor(NEGRO).font('Helvetica').text(concepto, 28, posY + 12, { width: W - 56 });
    posY += 36;
  }

  // Detalle
  doc.moveTo(28, posY).lineTo(W - 28, posY).strokeColor(LINEA).lineWidth(0.5).stroke();
  posY += 10;

  function filaDet(label, valor, colorVal = NEGRO) {
    doc.fontSize(9).fillColor(GRIS).font('Helvetica').text(label, 28, posY);
    doc.fontSize(9).fillColor(colorVal).font('Helvetica-Bold')
       .text(valor, 0, posY, { align: 'right', width: W - 28 });
    posY += 15;
  }

  filaDet('Monto abonado', fmtM(monto) || '—', VERDE);
  if (saldo && parseFloat(saldo) > 0) {
    filaDet('Saldo restante', fmtM(saldo), ROJO);
  }
  if (notas) {
    posY += 4;
    doc.fontSize(8).fillColor(GRIS2).font('Helvetica').text(`Notas: ${notas}`, 28, posY, { width: W - 56 });
    posY += 14;
  }

  // Pie
  const yPie = H - 38;
  doc.rect(0, yPie, W, 38).fill('#f5f5f5');
  doc.moveTo(0, yPie).lineTo(W, yPie).strokeColor(LINEA).lineWidth(0.5).stroke();
  doc.fontSize(7.5).fillColor(GRIS2).font('Helvetica')
     .text('Yadon Automotores — Catamarca', 0, yPie + 8, { align: 'center' })
     .text(`Fecha: ${fecha || '—'}`, 0, yPie + 20, { align: 'center' });

  doc.end();
});

module.exports = router;
