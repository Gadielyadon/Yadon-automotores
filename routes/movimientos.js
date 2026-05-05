const express = require('express');
const router  = express.Router();
const db      = require('../db');

// Listar movimientos de un cliente (orden cronológico)
router.get('/:clienteId', (req, res) => {
  const movs = db.query(
    'SELECT * FROM movimientos WHERE cliente_id=? ORDER BY fecha ASC, id ASC',
    [req.params.clienteId]
  );
  res.json(movs);
});

// Registrar un nuevo movimiento (manual)
// Body: { fecha, abono: bool, pago: number, notas: string }
router.post('/:clienteId', (req, res) => {
  const clienteId = req.params.clienteId;
  const cliente   = db.get('SELECT * FROM clientes WHERE id=?', [clienteId]);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  const { fecha, abono, pago, notas } = req.body;
  if (!fecha) return res.status(400).json({ error: 'La fecha es requerida' });

  const esCuotas = cliente.modalidad === 'cuotas';
  const saldoAnt = db.saldoActual(clienteId);

  let interes = 0;
  let saldoConInteres;

  if (esCuotas) {
    // Cuotas fijas: sin interés adicional, se descuenta directo del saldo
    interes = 0;
    saldoConInteres = saldoAnt;
  } else {
    // Interés mensual normal
    interes = Math.round(saldoAnt * (cliente.tasa_mensual / 100));
    saldoConInteres = saldoAnt + interes;
  }

  const pagoVal    = abono ? (parseFloat(pago) || 0) : 0;
  const saldoNuevo = Math.max(0, saldoConInteres - pagoVal);

  let numRecibo = '';
  if (abono && pagoVal > 0) {
    numRecibo = db.siguienteRecibo();
  }

  const r = db.run(
    `INSERT INTO movimientos (cliente_id, fecha, saldo_anterior, interes, pago, saldo_nuevo, abono, numero_recibo, notas)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [clienteId, fecha, saldoAnt, interes, pagoVal, saldoNuevo,
     abono ? 1 : 0, numRecibo, notas||'']
  );
  db.save();

  res.json({
    id: r.lastInsertRowid,
    numero_recibo: numRecibo,
    saldo_anterior: saldoAnt,
    interes,
    saldo_con_interes: saldoConInteres,
    pago: pagoVal,
    saldo_nuevo: saldoNuevo
  });
});

// Eliminar un movimiento (corrección)
router.delete('/:id', (req, res) => {
  db.run('DELETE FROM movimientos WHERE id=?', [req.params.id]);
  db.save();
  res.json({ ok: true });
});

module.exports = router;