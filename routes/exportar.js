const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const ExcelJS  = require('exceljs');

const ROJO   = 'FFD92B2B';
const VERDE  = 'FF16a34a';
const AZUL   = 'FF2563eb';
const NARANJ = 'FFd97706';
const NEGRO  = 'FF1a2744';
const GRISC  = 'FFf8f9fb';
const BLANC  = 'FFFFFFFF';

function fmtF(f) {
  if (!f) return '';
  const [y, m, d] = f.split('-');
  return `${d}/${m}/${y}`;
}
function fmtNum(n) {
  return Number(n || 0);
}

function construirHoja(ws, cliente, movs) {
  const esCuotas = cliente.modalidad === 'cuotas';
  const cuotasPagadas = movs.filter(m => m.abono === 1).length;
  const totalFinanciado = esCuotas
    ? (cliente.cuota_fija || 0) * (cliente.total_cuotas || 0)
    : null;

  // ── ENCABEZADO DEL CLIENTE ──────────────────────────────────────
  const titulo = ws.addRow([`CUENTA CORRIENTE — ${cliente.nombre.toUpperCase()}`]);
  ws.mergeCells(`A${titulo.number}:H${titulo.number}`);
  titulo.getCell(1).font      = { bold: true, size: 13, color: { argb: BLANC } };
  titulo.getCell(1).fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: NEGRO } };
  titulo.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  titulo.height = 22;

  // Info del cliente (2 columnas)
  const infoRows = [
    ['Vehículo',   cliente.auto_descripcion || '—', 'Modalidad', esCuotas ? `${cliente.total_cuotas} cuotas de $${(cliente.cuota_fija||0).toLocaleString('es-AR')}` : `Interés ${cliente.tasa_mensual}% mensual`],
    ['Saldo inicial', fmtNum(cliente.saldo_inicial), esCuotas ? 'Total financiado' : 'Saldo c/ interés', esCuotas ? fmtNum(totalFinanciado) : fmtNum(cliente.saldo_inicial)],
    ['Saldo actual',  fmtNum(cliente.saldo_actual),  esCuotas ? 'Estado cuotas' : 'Próximo interés', esCuotas ? `Cuota ${cuotasPagadas} de ${cliente.total_cuotas}` : fmtNum(cliente.proximo_interes || 0)],
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

  // ── ENCABEZADOS DE TABLA ────────────────────────────────────────
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

  // ── FILAS DE MOVIMIENTOS ────────────────────────────────────────
  let contCuota = 0;
  movs.forEach(m => {
    const esAbono = m.abono === 1;
    if (esAbono) contCuota++;

    const estado = esAbono ? 'PAGADO' : 'NO PAGÓ';
    const values = esCuotas
      ? [fmtF(m.fecha), estado, esAbono ? `${contCuota} de ${cliente.total_cuotas}` : '—', fmtNum(m.saldo_anterior), esAbono ? fmtNum(m.pago) : '—', fmtNum(m.saldo_nuevo), m.numero_recibo || '—', m.notas || '']
      : [fmtF(m.fecha), estado, fmtNum(m.saldo_anterior), fmtNum(m.interes), esAbono ? fmtNum(m.pago) : '—', fmtNum(m.saldo_nuevo), m.numero_recibo || '—', m.notas || ''];

    const row = ws.addRow(values);
    row.height = 16;

    // Color de fondo alternado
    const bgFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLANC } };

    row.eachCell({ includeEmpty: true }, cell => {
      cell.fill      = bgFill;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.font      = { size: 9 };
    });

    // Estado
    const estadoCell = row.getCell(2);
    if (esAbono) {
      estadoCell.font = { bold: true, size: 9, color: { argb: VERDE } };
    } else {
      estadoCell.font = { bold: true, size: 9, color: { argb: ROJO } };
    }

    // Números con formato $
    if (esCuotas) {
      if (m.saldo_anterior) row.getCell(4).numFmt = '$#,##0';
      if (esAbono && m.pago) row.getCell(5).numFmt = '$#,##0';
      if (m.saldo_nuevo !== undefined) row.getCell(6).numFmt = '$#,##0';
      // Saldo nuevo color
      row.getCell(6).font = { bold: true, size: 9, color: { argb: m.saldo_nuevo === 0 ? VERDE : ROJO } };
    } else {
      if (m.saldo_anterior) row.getCell(3).numFmt = '$#,##0';
      if (m.interes) { row.getCell(4).numFmt = '$#,##0'; row.getCell(4).font = { size: 9, color: { argb: NARANJ } }; }
      if (esAbono && m.pago) row.getCell(5).numFmt = '$#,##0';
      if (m.saldo_nuevo !== undefined) row.getCell(6).numFmt = '$#,##0';
      row.getCell(6).font = { bold: true, size: 9, color: { argb: m.saldo_nuevo === 0 ? VERDE : ROJO } };
    }

    // Bordes sutiles
    row.eachCell({ includeEmpty: true }, cell => {
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFe2e5ea' } } };
    });
  });

  // ── ANCHO DE COLUMNAS ───────────────────────────────────────────
  ws.columns = [
    { width: 13 }, { width: 11 }, { width: 14 },
    { width: 16 }, { width: 16 }, { width: 16 },
    { width: 13 }, { width: 30 },
  ];
}

// ── GET /api/exportar/:clienteId  → XLS de una cuenta
router.get('/:clienteId', async (req, res) => {
  const cliente = db.get('SELECT * FROM clientes WHERE id=?', [req.params.clienteId]);
  if (!cliente) return res.status(404).json({ error: 'No encontrado' });
  cliente.saldo_actual    = db.saldoActual(cliente.id);
  cliente.proximo_interes = db.calcularProximoInteres(cliente.id);
  const movs = db.query('SELECT * FROM movimientos WHERE cliente_id=? ORDER BY fecha ASC, id ASC', [cliente.id]);

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

// ── GET /api/exportar  → XLS de TODAS las cuentas (una hoja por cliente)
router.get('/', async (req, res) => {
  const clientes = db.query("SELECT * FROM clientes WHERE estado='activo' ORDER BY nombre ASC");

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Yadon Automotores';
  wb.created = new Date();

  // Hoja resumen general
  const wsRes = wb.addWorksheet('RESUMEN');
  const hdrRes = wsRes.addRow(['Cliente', 'Vehículo', 'Modalidad', 'Saldo inicial', 'Saldo actual', 'Teléfono']);
  hdrRes.height = 18;
  hdrRes.eachCell(cell => {
    cell.font  = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
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

    const r = wsRes.addRow([c.nombre, c.auto_descripcion || '—', modalLabel, c.saldo_inicial, c.saldo_actual, c.telefono || '—']);
    r.getCell(4).numFmt = '$#,##0';
    r.getCell(5).numFmt = '$#,##0';
    r.getCell(5).font   = { bold: true, color: { argb: ROJO } };
    r.height = 15;
  });

  // Fila de total
  const totRow = wsRes.addRow(['TOTAL DEUDA', '', '', '', deudaTotal, '']);
  totRow.getCell(1).font = { bold: true };
  totRow.getCell(5).numFmt = '$#,##0';
  totRow.getCell(5).font   = { bold: true, color: { argb: ROJO } };

  wsRes.columns = [{ width: 25 }, { width: 28 }, { width: 28 }, { width: 16 }, { width: 16 }, { width: 15 }];

  // Una hoja por cliente con su historial
  clientes.forEach(c => {
    const movs = db.query('SELECT * FROM movimientos WHERE cliente_id=? ORDER BY fecha ASC, id ASC', [c.id]);
    const sheetName = c.nombre.substring(0, 31).replace(/[:\\\/\?\*\[\]]/g, '');
    const ws = wb.addWorksheet(sheetName);
    construirHoja(ws, c, movs);
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="yadon-cuentas-completo.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

module.exports = router;