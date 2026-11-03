const express = require('express');
const router  = express.Router();
const db      = require('../db');

// Fecha de hoy en hora local (YYYY-MM-DD)
function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ¿La cuenta está saldada?
//  - interés: saldo en 0 (y con al menos un movimiento cargado)
//  - cuotas : todas las cuotas pagadas, o saldo en 0
function esSaldada(c, saldo, cuotasPagadas, cantMovs) {
  if (cantMovs === 0) return false;
  if (c.modalidad === 'cuotas' && c.total_cuotas > 0 && cuotasPagadas >= c.total_cuotas) return true;
  return saldo <= 0;
}

// ── Listar todos — UN SOLO JOIN en lugar de 3 queries por cliente ──
router.get('/', (req, res) => {
  // Saldo actual = último saldo_nuevo de movimientos, o saldo_inicial si no hay movimientos
  const clientes = db.query(`
    SELECT
      c.*,
      COALESCE(ult.saldo_nuevo, c.saldo_inicial)  AS saldo_actual,
      ult.fecha                                    AS ultimo_movimiento,
      ult.abono                                    AS ultimo_abono,
      (SELECT COUNT(*) FROM movimientos m WHERE m.cliente_id = c.id)               AS cant_movs,
      (SELECT COUNT(*) FROM movimientos m WHERE m.cliente_id = c.id AND m.abono=1) AS cuotas_pagadas
    FROM clientes c
    LEFT JOIN (
      SELECT m.cliente_id, m.saldo_nuevo, m.fecha, m.abono
      FROM movimientos m
      INNER JOIN (
        SELECT cliente_id, MAX(id) AS max_id
        FROM movimientos
        GROUP BY cliente_id
      ) last ON m.id = last.max_id
    ) ult ON ult.cliente_id = c.id
    ORDER BY c.nombre ASC
  `);
  clientes.forEach(c => {
    c.saldada = esSaldada(c, c.saldo_actual, c.cuotas_pagadas, c.cant_movs);
  });
  res.json(clientes);
});

// ── Obtener uno ───────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const c = db.get('SELECT * FROM clientes WHERE id=?', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'No encontrado' });
  c.saldo_actual    = db.saldoActual(c.id);
  c.proximo_interes = db.calcularProximoInteres(c.id);
  const st = db.get(
    `SELECT COUNT(*) AS cant, COALESCE(SUM(CASE WHEN abono=1 THEN 1 ELSE 0 END),0) AS pagadas
     FROM movimientos WHERE cliente_id=?`, [c.id]);
  c.saldada = esSaldada(c, c.saldo_actual, st.pagadas, st.cant);
  res.json(c);
});

// ── Crear ─────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { nombre, telefono, dni, auto_descripcion, saldo_inicial, modalidad,
          cuota_fija, total_cuotas, observaciones, fecha_inicio } = req.body;
  if (!nombre) return res.status(400).json({ error: 'El nombre es requerido' });
  if (!saldo_inicial || saldo_inicial <= 0)
    return res.status(400).json({ error: 'El saldo inicial es requerido' });

  const r = db.run(
    `INSERT INTO clientes (nombre, telefono, dni, auto_descripcion, saldo_inicial,
      tasa_mensual, modalidad, cuota_fija, total_cuotas, observaciones, fecha_inicio)
     VALUES (?,?,?,?,?,6,?,?,?,?,?)`,
    [nombre, telefono||'', dni||'', auto_descripcion||'', saldo_inicial,
     modalidad||'interes', cuota_fija||0, total_cuotas||0,
     observaciones||'', fecha_inicio||hoyLocal()]
  );
  res.json({ id: r.lastInsertRowid });
});

// ── Editar ────────────────────────────────────────────────────────
// El estado (activo/archivado) NO se cambia desde acá: se usan /archivar y /reactivar.
// Antes, editar sin mandar "estado" dejaba la cuenta como 'activo' sin querer.
router.put('/:id', (req, res) => {
  const actual = db.get('SELECT id FROM clientes WHERE id=?', [req.params.id]);
  if (!actual) return res.status(404).json({ error: 'No encontrado' });
  const { nombre, telefono, dni, auto_descripcion, cuota_fija, total_cuotas, observaciones } = req.body;
  if (!nombre || !String(nombre).trim())
    return res.status(400).json({ error: 'El nombre es requerido' });
  db.run(
    `UPDATE clientes SET nombre=?, telefono=?, dni=?, auto_descripcion=?,
     cuota_fija=?, total_cuotas=?, observaciones=? WHERE id=?`,
    [nombre, telefono||'', dni||'', auto_descripcion||'',
     cuota_fija||0, total_cuotas||0, observaciones||'', req.params.id]
  );
  res.json({ ok: true });
});

// ── Archivar (lo decide el usuario, nunca automático) ─────────────
router.post('/:id/archivar', (req, res) => {
  const c = db.get('SELECT id, estado FROM clientes WHERE id=?', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'No encontrado' });
  // El motivo es obligatorio (ej: "Saldada", "Duplicada" o un texto libre)
  const motivo = String(req.body.motivo || '').trim().replace(/\s+/g, ' ');
  if (!motivo) return res.status(400).json({ error: 'Indicá el motivo del archivado' });
  if (motivo.length > 100) return res.status(400).json({ error: 'El motivo es muy largo (máximo 100 caracteres)' });
  if (c.estado !== 'archivado')
    db.run("UPDATE clientes SET estado='archivado', fecha_archivo=?, motivo_archivo=? WHERE id=?",
      [hoyLocal(), motivo, c.id]);
  res.json({ ok: true });
});

// ── Reactivar una cuenta archivada ────────────────────────────────
router.post('/:id/reactivar', (req, res) => {
  const c = db.get('SELECT id FROM clientes WHERE id=?', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'No encontrado' });
  db.run("UPDATE clientes SET estado='activo', fecha_archivo='', motivo_archivo='' WHERE id=?", [c.id]);
  res.json({ ok: true });
});

// ── Eliminar ──────────────────────────────────────────────────────
// Solo si el cliente no tiene movimientos (ej: se creó por error).
// Si tiene historial, hay que archivarlo para no perder los datos.
router.delete('/:id', (req, res) => {
  const n = db.get('SELECT COUNT(*) AS n FROM movimientos WHERE cliente_id=?', [req.params.id]);
  if (n && n.n > 0)
    return res.status(409).json({ error: 'La cuenta tiene movimientos. Archivala en lugar de eliminarla para conservar el historial.' });
  db.run('DELETE FROM clientes WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
