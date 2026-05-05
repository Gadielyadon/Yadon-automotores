const express = require('express');
const router  = express.Router();
const db      = require('../db');

// Listar todas (opcionalmente filtrar por mes: ?mes=2026-04)
router.get('/', (req, res) => {
  const { mes } = req.query;
  let ventas;
  if (mes) {
    ventas = db.query(
      "SELECT * FROM ventas WHERE strftime('%Y-%m', fecha) = ? ORDER BY fecha DESC",
      [mes]
    );
  } else {
    ventas = db.query('SELECT * FROM ventas ORDER BY fecha DESC');
  }
  res.json(ventas);
});

// Resumen por mes (para el panel): cuántos autos y total $
router.get('/resumen', (req, res) => {
  const resumen = db.query(`
    SELECT
      strftime('%Y-%m', fecha) as mes,
      COUNT(*) as cantidad,
      SUM(precio) as total
    FROM ventas
    GROUP BY mes
    ORDER BY mes DESC
    LIMIT 12
  `);
  res.json(resumen);
});

// Crear
router.post('/', (req, res) => {
  const { fecha, auto_desc, precio, comprador, notas } = req.body;
  if (!auto_desc) return res.status(400).json({ error: 'El auto es requerido' });
  if (!precio || precio <= 0) return res.status(400).json({ error: 'El precio es requerido' });

  const r = db.run(
    'INSERT INTO ventas (fecha, auto_desc, precio, comprador, notas) VALUES (?,?,?,?,?)',
    [fecha || new Date().toISOString().split('T')[0], auto_desc, precio, comprador||'', notas||'']
  );
  db.save();
  res.json({ id: r.lastInsertRowid });
});

// Editar
router.put('/:id', (req, res) => {
  const { fecha, auto_desc, precio, comprador, notas } = req.body;
  db.run(
    'UPDATE ventas SET fecha=?, auto_desc=?, precio=?, comprador=?, notas=? WHERE id=?',
    [fecha, auto_desc, precio, comprador||'', notas||'', req.params.id]
  );
  db.save();
  res.json({ ok: true });
});

// Eliminar
router.delete('/:id', (req, res) => {
  db.run('DELETE FROM ventas WHERE id=?', [req.params.id]);
  db.save();
  res.json({ ok: true });
});

module.exports = router;