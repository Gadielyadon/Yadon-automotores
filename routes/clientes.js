const express = require('express');
const router  = express.Router();
const db      = require('../db');

const { hoyLocal, esSaldada } = require('../calculos');

// Recalcula la cadena de saldos de una cuenta en cuotas a partir de su saldo inicial:
// cada movimiento arrastra el saldo del anterior (en orden de carga). Conserva el interés y el pago de cada uno.
function recalcularCuotas(clienteId) {
  const c = db.get('SELECT saldo_inicial FROM clientes WHERE id=?', [clienteId]);
  let saldo = c.saldo_inicial;
  const movs = db.query(
    'SELECT id, pago, interes, saldo_anterior, saldo_nuevo FROM movimientos WHERE cliente_id=? ORDER BY id ASC',
    [clienteId]);
  let cambios = 0;
  for (const m of movs) {
    const nuevo = Math.max(0, saldo + (m.interes || 0) - (m.pago || 0));
    if (m.saldo_anterior !== saldo || m.saldo_nuevo !== nuevo) {
      db.run('UPDATE movimientos SET saldo_anterior=?, saldo_nuevo=? WHERE id=?', [saldo, nuevo, m.id]);
      cambios++;
    }
    saldo = nuevo;
  }
  return cambios;
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
  let { nombre, telefono, dni, auto_descripcion, saldo_inicial, modalidad,
        cuota_fija, total_cuotas, observaciones, fecha_inicio } = req.body;
  if (!nombre) return res.status(400).json({ error: 'El nombre es requerido' });

  if (modalidad === 'cuotas') {
    if (!(cuota_fija > 0) || !(total_cuotas > 0))
      return res.status(400).json({ error: 'Completá el monto de la cuota y la cantidad de cuotas' });
    // Si no viene un saldo a financiar, se toma el total de las cuotas (cuota × cantidad)
    if (!saldo_inicial || saldo_inicial <= 0) saldo_inicial = cuota_fija * total_cuotas;
  }
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
  const actual = db.get('SELECT id, modalidad, estado, saldo_inicial FROM clientes WHERE id=?', [req.params.id]);
  if (!actual) return res.status(404).json({ error: 'No encontrado' });
  const { nombre, telefono, dni, auto_descripcion, cuota_fija, total_cuotas, observaciones, saldo_inicial } = req.body;
  if (!nombre || !String(nombre).trim())
    return res.status(400).json({ error: 'El nombre es requerido' });

  // Corregir el "saldo a financiar": solo cuentas en cuotas (en las de interés cambiaría el historial de intereses)
  const nuevoSaldo = parseFloat(saldo_inicial);
  const cambiaSaldo = actual.modalidad === 'cuotas' && nuevoSaldo > 0 && nuevoSaldo !== actual.saldo_inicial;
  if (cambiaSaldo && actual.estado === 'archivado')
    return res.status(409).json({ error: 'La cuenta está archivada. Reactivala para corregir el saldo a financiar.' });
  if (cambiaSaldo) {
    // Copia de seguridad de la base ANTES de recalcular; si no se puede hacer, no se toca nada
    const copia = db.hacerBackupManual(`autogest-antes-de-corregir-saldo-cliente${actual.id}-${Date.now()}.db`);
    if (!copia) return res.status(500).json({ error: 'No se pudo hacer la copia de seguridad; no se modificó nada.' });
  }

  db.run(
    `UPDATE clientes SET nombre=?, telefono=?, dni=?, auto_descripcion=?,
     cuota_fija=?, total_cuotas=?, observaciones=? WHERE id=?`,
    [nombre, telefono||'', dni||'', auto_descripcion||'',
     cuota_fija||0, total_cuotas||0, observaciones||'', req.params.id]
  );
  let recalculados = 0;
  if (cambiaSaldo) {
    db.run('UPDATE clientes SET saldo_inicial=? WHERE id=?', [nuevoSaldo, actual.id]);
    recalculados = recalcularCuotas(actual.id);
  }
  res.json({ ok: true, saldo_corregido: cambiaSaldo, movimientos_recalculados: recalculados });
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
