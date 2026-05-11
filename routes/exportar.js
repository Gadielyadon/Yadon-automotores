const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const ExcelJS  = require('exceljs');
const PDFDoc   = require('pdfkit');

const ROJO   = 'FFD92B2B';
const VERDE  = 'FF16a34a';
const NARANJ = 'FFd97706';
const NEGRO  = 'FF1a2744';
const BLANC  = 'FFFFFFFF';

function fmtF(f) {
  if (!f) return '';
  const [y, m, d] = f.split('-');
  return `${d}/${m}/${y}`;
}
function fmtNum(n) { return Number(n || 0); }
function fmtPeso(n) {
  return '$' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0 });
}

// ═══════════════════════════════════════════════════════════════════
// EXCEL
// ═══════════════════════════════════════════════════════════════════
function construirHoja(ws, cliente, movs) {
  const esCuotas      = cliente.modalidad === 'cuotas';
  const cuotasPagadas = movs.filter(m => m.abono === 1).length;
  const totalFinanciado = esCuotas ? (cliente.cuota_fija || 0) * (cliente.total_cuotas || 0) : null;

  const titulo = ws.addRow([`CUENTA CORRIENTE — ${cliente.nombre.toUpperCase()}`]);
  ws.mergeCells(`A${titulo.number}:H${titulo.number}`);
  titulo.getCell(1).font      = { bold: true, size: 13, color: { argb: BLANC } };
  titulo.getCell(1).fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: NEGRO } };
  titulo.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  titulo.height = 22;

  const infoRows = [
    ['Vehículo', cliente.auto_descripcion || '—', 'Modalidad',
      esCuotas ? `${cliente.total_cuotas} cuotas de $${(cliente.cuota_fija||0).toLocaleString('es-AR')}` : `Interés ${cliente.tasa_mensual}% mensual`],
    ['Saldo inicial', fmtNum(cliente.saldo_inicial),
      esCuotas ? 'Total financiado' : 'Saldo c/ interés',
      esCuotas ? fmtNum(totalFinanciado) : fmtNum(cliente.saldo_inicial)],
    ['Saldo actual', fmtNum(cliente.saldo_actual),
      esCuotas ? 'Estado cuotas' : 'Próximo interés',
      esCuotas ? `Cuota ${cuotasPagadas} de ${cliente.total_cuotas}` : fmtNum(cliente.proximo_interes || 0)],
  ];

  infoRows.forEach(([l1, v1, l2, v2]) => {
    const r = ws.addRow([l1, v1, '', l2, v2]);
    r.getCell(1).font = { bold: true, size: 9, color: { argb: '88000000' } };
    r.getCell(4).font = { bold: true, size: 9, color: { argb: '88000000' } };
    r.getCell(2).font = { bold: true, size: 10 };
    r.getCell(5).font = { bold: true, size: 10 };
    if (typeof v1 === 'number') r.getCell(2).numFmt = '$#,##0';
    if (typeof v2 === 'number') r.getCell(5).numFmt = '$#,##0';
    r.height = 17;
  });

  ws.addRow([]);

  const cols = esCuotas
    ? ['Fecha', 'Estado', 'N° Cuota', 'Saldo anterior', 'Abono', 'Saldo nuevo', 'N° Recibo', 'Notas']
    : ['Fecha', 'Estado', 'Saldo anterior', 'Interés', 'Abono', 'Saldo nuevo', 'N° Recibo', 'Notas'];

  const hdrRow = ws.addRow(cols);
  hdrRow.height = 18;
  hdrRow.eachCell(cell => {
    cell.font      = { bold: true, size: 9, color: { argb: BLANC } };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: NEGRO } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border    = { bottom: { style: 'thin', color: { argb: 'FFaaaaaa' } } };
  });

  let contCuota = 0;
  movs.forEach(m => {
    const esAbono = m.abono === 1;
    if (esAbono) contCuota++;
    const estado = esAbono ? 'PAGADO' : 'NO PAGÓ';
    const values = esCuotas
      ? [fmtF(m.fecha), estado, esAbono ? `${contCuota} de ${cliente.total_cuotas}` : '—',
         fmtNum(m.saldo_anterior), esAbono ? fmtNum(m.pago) : '—', fmtNum(m.saldo_nuevo), m.numero_recibo || '—', m.notas || '']
      : [fmtF(m.fecha), estado, fmtNum(m.saldo_anterior), fmtNum(m.interes),
         esAbono ? fmtNum(m.pago) : '—', fmtNum(m.saldo_nuevo), m.numero_recibo || '—', m.notas || ''];

    const row = ws.addRow(values);
    row.height = 16;
    row.eachCell({ includeEmpty: true }, cell => {
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLANC } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.font      = { size: 9 };
      cell.border    = { bottom: { style: 'hair', color: { argb: 'FFe2e5ea' } } };
    });
    row.getCell(2).font = { bold: true, size: 9, color: { argb: esAbono ? VERDE : ROJO } };

    if (esCuotas) {
      if (m.saldo_anterior) row.getCell(4).numFmt = '$#,##0';
      if (esAbono && m.pago) row.getCell(5).numFmt = '$#,##0';
      if (m.saldo_nuevo !== undefined) row.getCell(6).numFmt = '$#,##0';
      row.getCell(6).font = { bold: true, size: 9, color: { argb: m.saldo_nuevo === 0 ? VERDE : ROJO } };
    } else {
      if (m.saldo_anterior) row.getCell(3).numFmt = '$#,##0';
      if (m.interes) { row.getCell(4).numFmt = '$#,##0'; row.getCell(4).font = { size: 9, color: { argb: NARANJ } }; }
      if (esAbono && m.pago) row.getCell(5).numFmt = '$#,##0';
      if (m.saldo_nuevo !== undefined) row.getCell(6).numFmt = '$#,##0';
      row.getCell(6).font = { bold: true, size: 9, color: { argb: m.saldo_nuevo === 0 ? VERDE : ROJO } };
    }
  });

  ws.columns = [
    { width: 13 }, { width: 11 }, { width: 14 },
    { width: 16 }, { width: 16 }, { width: 16 },
    { width: 13 }, { width: 30 },
  ];
}

// ═══════════════════════════════════════════════════════════════════
// PDF — respaldo completo con todos los movimientos, pagina si hace falta
// ═══════════════════════════════════════════════════════════════════
function generarPDFCliente(res, cliente, movs) {
  const esCuotas      = cliente.modalidad === 'cuotas';
  const cuotasPagadas = movs.filter(m => m.abono === 1).length;
  const saldoActual   = cliente.saldo_actual;
  const doc = new PDFDoc({ margin: 40, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition',
    `attachment; filename="respaldo-${cliente.nombre.replace(/\s+/g,'_')}.pdf"`);
  doc.pipe(res);

  // ── Encabezado azul ─────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 68).fill('#1a2744');
  doc.fillColor('white').fontSize(15).font('Helvetica-Bold')
     .text('YADON AUTOMOTORES', 40, 16);
  doc.fontSize(9).font('Helvetica')
     .text('Historial completo de cuenta corriente', 40, 38);
  doc.fontSize(8)
     .text(`Generado: ${new Date().toLocaleDateString('es-AR')} ${new Date().toLocaleTimeString('es-AR')}`, 40, 52);

  // ── Info del cliente ─────────────────────────────────────────────
  doc.roundedRect(40, 80, doc.page.width - 80, 90, 6).fillAndStroke('#f8f9fb', '#e2e5ea');
  doc.fillColor('#1a2744').fontSize(13).font('Helvetica-Bold')
     .text(cliente.nombre.toUpperCase(), 55, 90);
  doc.fillColor('#555').fontSize(9).font('Helvetica')
     .text(cliente.auto_descripcion || 'Sin vehículo', 55, 107);

  // 3 columnas de info
  const infoY = 122;
  const infoItems = esCuotas ? [
    ['SALDO INICIAL',  fmtPeso(cliente.saldo_inicial)],
    ['CUOTA MENSUAL',  fmtPeso(cliente.cuota_fija)],
    ['CUOTAS PAGAS',  `${cuotasPagadas} / ${cliente.total_cuotas}`],
    ['SALDO RESTANTE', fmtPeso(saldoActual)],
    ['TOTAL CUOTAS',  `${cliente.total_cuotas}`],
    ['INICIO',         fmtF(cliente.fecha_inicio)],
  ] : [
    ['SALDO INICIAL',  fmtPeso(cliente.saldo_inicial)],
    ['TASA MENSUAL',  `${cliente.tasa_mensual}%`],
    ['SALDO ACTUAL',   fmtPeso(saldoActual)],
    ['TELÉFONO',       cliente.telefono || '—'],
    ['DNI',            cliente.dni || '—'],
    ['INICIO',         fmtF(cliente.fecha_inicio)],
  ];

  const cols3 = [55, 215, 375];
  for (let i = 0; i < 6; i++) {
    const x = cols3[i % 3];
    const y = infoY + Math.floor(i / 3) * 22;
    doc.fillColor('#999').fontSize(7).font('Helvetica').text(infoItems[i][0], x, y);
    doc.fillColor('#1a2744').fontSize(10).font('Helvetica-Bold').text(infoItems[i][1], x, y + 9);
  }

  // ── Tabla ────────────────────────────────────────────────────────
  const pageW  = doc.page.width - 80;
  let   y      = 192;

  const dibujarEncabezadoTabla = (yPos) => {
    doc.rect(40, yPos, pageW, 17).fill('#1a2744');
    doc.fillColor('white').fontSize(7.5).font('Helvetica-Bold');
    if (esCuotas) {
      doc.text('FECHA',      48,  yPos+5);
      doc.text('ESTADO',    108,  yPos+5);
      doc.text('N° CUOTA',  168,  yPos+5);
      doc.text('SALDO ANT.',230,  yPos+5);
      doc.text('ABONO',     318,  yPos+5);
      doc.text('SALDO NVO', 400,  yPos+5);
      doc.text('RECIBO',    488,  yPos+5);
    } else {
      doc.text('FECHA',      48,  yPos+5);
      doc.text('ESTADO',    108,  yPos+5);
      doc.text('SALDO ANT.',168,  yPos+5);
      doc.text('INTERÉS',   256,  yPos+5);
      doc.text('ABONO',     318,  yPos+5);
      doc.text('SALDO NVO', 400,  yPos+5);
      doc.text('RECIBO',    488,  yPos+5);
    }
    return yPos + 19;
  };

  y = dibujarEncabezadoTabla(y);

  let contCuota   = 0;
  let totalAbonado = 0;

  movs.forEach((m, i) => {
    const esAbono = m.abono === 1;
    if (esAbono) { contCuota++; totalAbonado += (m.pago || 0); }

    // Salto de página
    if (y > doc.page.height - 70) {
      doc.addPage();
      y = dibujarEncabezadoTabla(40);
    }

    // Fondo alternado
    if (i % 2 === 0) doc.rect(40, y, pageW, 15).fill('#f8f9fb');

    doc.fillColor('#333').fontSize(8).font('Helvetica');

    if (esCuotas) {
      doc.text(fmtF(m.fecha),                    48, y+3);
      doc.fillColor(esAbono ? '#16a34a' : '#D92B2B').font('Helvetica-Bold')
         .text(esAbono ? 'PAGADO' : 'NO PAGÓ',  108, y+3);
      doc.fillColor('#333').font('Helvetica')
         .text(esAbono ? `${contCuota}/${cliente.total_cuotas}` : '—', 168, y+3)
         .text(fmtPeso(m.saldo_anterior),        230, y+3)
         .text(esAbono ? fmtPeso(m.pago) : '—', 318, y+3);
      doc.fillColor(m.saldo_nuevo === 0 ? '#16a34a' : '#D92B2B').font('Helvetica-Bold')
         .text(fmtPeso(m.saldo_nuevo),            400, y+3);
      doc.fillColor('#666').font('Helvetica').fontSize(7)
         .text(m.numero_recibo || '—',            488, y+3);
    } else {
      doc.text(fmtF(m.fecha),                    48, y+3);
      doc.fillColor(esAbono ? '#16a34a' : '#D92B2B').font('Helvetica-Bold')
         .text(esAbono ? 'PAGADO' : 'NO PAGÓ',  108, y+3);
      doc.fillColor('#333').font('Helvetica')
         .text(fmtPeso(m.saldo_anterior),        168, y+3);
      doc.fillColor('#d97706')
         .text(m.interes > 0 ? fmtPeso(m.interes) : '—', 256, y+3);
      doc.fillColor('#333')
         .text(esAbono ? fmtPeso(m.pago) : '—', 318, y+3);
      doc.fillColor(m.saldo_nuevo === 0 ? '#16a34a' : '#D92B2B').font('Helvetica-Bold')
         .text(fmtPeso(m.saldo_nuevo),            400, y+3);
      doc.fillColor('#666').font('Helvetica').fontSize(7)
         .text(m.numero_recibo || '—',            488, y+3);
    }

    doc.moveTo(40, y+15).lineTo(40+pageW, y+15)
       .strokeColor('#e2e5ea').lineWidth(0.4).stroke();
    y += 15;
    doc.fontSize(8);
  });

  // ── Pie resumen ──────────────────────────────────────────────────
  y += 8;
  if (y > doc.page.height - 55) { doc.addPage(); y = 40; }

  doc.rect(40, y, pageW, 38).fillAndStroke('#eff6ff', '#2563eb');
  doc.fillColor('#1a2744').fontSize(9).font('Helvetica-Bold')
     .text(`Total movimientos: ${movs.length}`, 55, y+7);
  doc.text(`Total abonado: ${fmtPeso(totalAbonado)}`, 210, y+7);
  doc.fillColor('#D92B2B')
     .text(`Saldo final: ${fmtPeso(saldoActual)}`, 390, y+7);
  if (esCuotas) {
    doc.fillColor('#2563eb').fontSize(8).font('Helvetica')
       .text(`Cuotas pagadas: ${cuotasPagadas} de ${cliente.total_cuotas}  |  Cuotas restantes: ${cliente.total_cuotas - cuotasPagadas}`,
         55, y+23);
  }

  doc.end();
}

// ═══════════════════════════════════════════════════════════════════
// RUTAS
// ═══════════════════════════════════════════════════════════════════

// GET /api/exportar/:clienteId/pdf  →  PDF respaldo completo
router.get('/:clienteId/pdf', (req, res) => {
  const cliente = db.get('SELECT * FROM clientes WHERE id=?', [req.params.clienteId]);
  if (!cliente) return res.status(404).json({ error: 'No encontrado' });
  cliente.saldo_actual    = db.saldoActual(cliente.id);
  cliente.proximo_interes = db.calcularProximoInteres(cliente.id);
  const movs = db.query(
    'SELECT * FROM movimientos WHERE cliente_id=? ORDER BY fecha ASC, id ASC',
    [cliente.id]
  );
  generarPDFCliente(res, cliente, movs);
});

// GET /api/exportar/:clienteId  →  XLS de una cuenta
router.get('/:clienteId', async (req, res) => {
  const cliente = db.get('SELECT * FROM clientes WHERE id=?', [req.params.clienteId]);
  if (!cliente) return res.status(404).json({ error: 'No encontrado' });
  cliente.saldo_actual    = db.saldoActual(cliente.id);
  cliente.proximo_interes = db.calcularProximoInteres(cliente.id);
  const movs = db.query(
    'SELECT * FROM movimientos WHERE cliente_id=? ORDER BY fecha ASC, id ASC',
    [cliente.id]
  );
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Yadon Automotores';
  wb.created = new Date();
  const ws = wb.addWorksheet(cliente.nombre.substring(0, 31));
  construirHoja(ws, cliente, movs);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="cuenta-${cliente.nombre.replace(/\s/g,'_')}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

// GET /api/exportar  →  XLS de TODAS las cuentas
router.get('/', async (req, res) => {
  const clientes = db.query("SELECT * FROM clientes WHERE estado='activo' ORDER BY nombre ASC");
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Yadon Automotores';
  wb.created = new Date();

  const wsRes = wb.addWorksheet('RESUMEN');
  const hdrRes = wsRes.addRow(['Cliente', 'Vehículo', 'Modalidad', 'Saldo inicial', 'Saldo actual', 'Teléfono']);
  hdrRes.height = 18;
  hdrRes.eachCell(cell => {
    cell.font  = { bold: true, size: 10, color: { argb: BLANC } };
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: NEGRO } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  let deudaTotal = 0;
  clientes.forEach(c => {
    c.saldo_actual    = db.saldoActual(c.id);
    c.proximo_interes = db.calcularProximoInteres(c.id);
    deudaTotal += c.saldo_actual;
    const modalLabel = c.modalidad === 'cuotas'
      ? `${c.total_cuotas} cuotas de $${(c.cuota_fija||0).toLocaleString('es-AR')}`
      : `Interés ${c.tasa_mensual}% mensual`;
    const r = wsRes.addRow([c.nombre, c.auto_descripcion||'—', modalLabel, c.saldo_inicial, c.saldo_actual, c.telefono||'—']);
    r.getCell(4).numFmt = '$#,##0';
    r.getCell(5).numFmt = '$#,##0';
    r.getCell(5).font   = { bold: true, color: { argb: ROJO } };
    r.height = 15;
  });

  const totRow = wsRes.addRow(['TOTAL DEUDA', '', '', '', deudaTotal, '']);
  totRow.getCell(1).font = { bold: true };
  totRow.getCell(5).numFmt = '$#,##0';
  totRow.getCell(5).font   = { bold: true, color: { argb: ROJO } };
  wsRes.columns = [{ width: 25 }, { width: 28 }, { width: 28 }, { width: 16 }, { width: 16 }, { width: 15 }];

  clientes.forEach(c => {
    const movs = db.query('SELECT * FROM movimientos WHERE cliente_id=? ORDER BY fecha ASC, id ASC', [c.id]);
    const sheetName = c.nombre.substring(0, 31).replace(/[:\\/\?\*\[\]]/g, '');
    const ws = wb.addWorksheet(sheetName);
    construirHoja(ws, c, movs);
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="yadon-cuentas-completo.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

module.exports = router;