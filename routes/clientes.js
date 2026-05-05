const express = require('express');
const router  = express.Router();
const db      = require('../db');

// Listar todos
router.get('/', (req, res) => {
  const clientes = db.query('SELECT * FROM clientes ORDER BY nombre ASC');
  clientes.forEach(c => {
    c.saldo_actual = db.saldoActual(c.id);
    const ult = db.get('SELECT fecha, abono, pago FROM movimientos WHERE cliente_id=? ORDER BY fecha DESC, id DESC LIMIT 1', [c.id]);
    c.ultimo_movimiento = ult ? ult.fecha : null;
    c.ultimo_abono = ult ? ult.abono : null;
  });
  res.json(clientes);
});

// Obtener uno
router.get('/:id', (req, res) => {
  const c = db.get('SELECT * FROM clientes WHERE id=?', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'No encontrado' });
  c.saldo_actual = db.saldoActual(c.id);
  c.proximo_interes = db.calcularProximoInteres(c.id);
  res.json(c);
});

// Crear
router.post('/', (req, res) => {
  const { nombre, telefono, dni, auto_descripcion, saldo_inicial, modalidad,
          cuota_fija, total_cuotas, observaciones, fecha_inicio } = req.body;
  if (!nombre) return res.status(400).json({ error: 'El nombre es requerido' });
  if (!saldo_inicial || saldo_inicial <= 0) return res.status(400).json({ error: 'El saldo inicial es requerido' });

  const r = db.run(
    `INSERT INTO clientes (nombre, telefono, dni, auto_descripcion, saldo_inicial,
      tasa_mensual, modalidad, cuota_fija, total_cuotas, observaciones, fecha_inicio)
     VALUES (?,?,?,?,?,6,?,?,?,?,?)`,
    [nombre, telefono||'', dni||'', auto_descripcion||'', saldo_inicial,
     modalidad||'interes', cuota_fija||0, total_cuotas||0,
     observaciones||'', fecha_inicio||new Date().toISOString().split('T')[0]]
  );
  db.save();
  res.json({ id: r.lastInsertRowid });
});

// Editar
router.put('/:id', (req, res) => {
  const { nombre, telefono, dni, auto_descripcion, cuota_fija, total_cuotas, observaciones, estado } = req.body;
  db.run(
    `UPDATE clientes SET nombre=?, telefono=?, dni=?, auto_descripcion=?,
     cuota_fija=?, total_cuotas=?, observaciones=?, estado=? WHERE id=?`,
    [nombre, telefono||'', dni||'', auto_descripcion||'',
     cuota_fija||0, total_cuotas||0, observaciones||'', estado||'activo', req.params.id]
  );
  db.save();
  res.json({ ok: true });
});

// Eliminar
router.delete('/:id', (req, res) => {
  db.run('DELETE FROM movimientos WHERE cliente_id=?', [req.params.id]);
  db.run('DELETE FROM clientes WHERE id=?', [req.params.id]);
  db.save();
  res.json({ ok: true });
});

module.exports = router;
