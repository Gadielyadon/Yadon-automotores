const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { hoyLocal, diasEntre, financiadoDe, pendienteDe, esSaldada } = require('../calculos');

const DIAS_MORA     = 30;   // una cuenta con saldo pendiente y más de 30 días sin pagar está "en mora"
const MESES_GRAFICO = 6;

// ── Panel general: todos los números salen de las cuentas y sus movimientos ──
router.get('/', (req, res) => {
  const hoy = hoyLocal();

  const filas = db.query(`
    SELECT c.id, c.nombre, c.auto_descripcion, c.estado, c.modalidad, c.cuota_fija, c.total_cuotas,
           c.saldo_inicial, c.fecha_inicio,
           COALESCE((SELECT m.saldo_nuevo FROM movimientos m WHERE m.cliente_id = c.id ORDER BY m.id DESC LIMIT 1),
                    c.saldo_inicial) AS saldo_actual,
           (SELECT COUNT(*) FROM movimientos m WHERE m.cliente_id = c.id)                  AS cant_movs,
           (SELECT COUNT(*) FROM movimientos m WHERE m.cliente_id = c.id AND m.abono = 1)  AS cuotas_pagadas,
           (SELECT MAX(m.fecha) FROM movimientos m WHERE m.cliente_id = c.id AND m.abono = 1) AS ultimo_pago
      FROM clientes c`);

  let activos = 0, archivadas = 0, saldadas = 0, enCuotas = 0, conInteres = 0;
  let financiado = 0, pendiente = 0, pendCuotas = 0, pendInteres = 0;
  const moraLista = [], saldadasLista = [];

  for (const c of filas) {
    if (c.estado === 'archivado') { archivadas++; continue; }
    activos++;

    const fin = financiadoDe(c);
    const pen = pendienteDe(c, c.cuotas_pagadas, c.saldo_actual);
    financiado += fin;
    pendiente  += pen;
    if (c.modalidad === 'cuotas') { enCuotas++;   pendCuotas  += pen; }
    else                          { conInteres++; pendInteres += pen; }

    if (esSaldada(c, c.saldo_actual, c.cuotas_pagadas, c.cant_movs)) {
      saldadas++;
      saldadasLista.push({ id: c.id, nombre: c.nombre, auto: c.auto_descripcion || '', ultimo_pago: c.ultimo_pago || null });
      continue;
    }

    // Mora: tiene saldo pendiente y pasaron más de DIAS_MORA días desde el último pago
    // (si todavía no pagó nada, se cuenta desde la fecha de inicio de la cuenta).
    if (pen > 0) {
      const desde = c.ultimo_pago || c.fecha_inicio;
      const dias  = diasEntre(desde, hoy);
      if (Number.isFinite(dias) && dias > DIAS_MORA) {
        moraLista.push({
          id: c.id, nombre: c.nombre, auto: c.auto_descripcion || '', modalidad: c.modalidad,
          ultimo_pago: c.ultimo_pago || null, desde, dias, pendiente: pen,
          cuotas_pagadas: c.cuotas_pagadas, total_cuotas: c.total_cuotas || 0
        });
      }
    }
  }
  moraLista.sort((a, b) => b.dias - a.dias);

  const tramos = {
    leve:  moraLista.filter(m => m.dias <= 60).length,                  // 31 a 60 días
    media: moraLista.filter(m => m.dias > 60 && m.dias <= 90).length,   // 61 a 90 días
    grave: moraLista.filter(m => m.dias > 90).length                    // más de 90 días
  };

  // Cobranzas por mes (todos los pagos registrados, últimos MESES_GRAFICO meses)
  const [yy, mm] = hoy.split('-').map(Number);
  const meses = [];
  for (let i = MESES_GRAFICO - 1; i >= 0; i--) {
    const t = yy * 12 + (mm - 1) - i;
    meses.push(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`);
  }
  const rows = db.query(
    `SELECT substr(fecha, 1, 7) AS mes, COALESCE(SUM(pago), 0) AS monto, COUNT(*) AS cant
       FROM movimientos WHERE abono = 1 AND fecha >= ? GROUP BY substr(fecha, 1, 7)`,
    [meses[0] + '-01']);
  const porMes = {};
  rows.forEach(r => { porMes[r.mes] = r; });
  const cobranzas = meses.map(mes => ({ mes, monto: porMes[mes] ? porMes[mes].monto : 0, cantidad: porMes[mes] ? porMes[mes].cant : 0 }));

  res.json({
    hoy,
    dias_mora: DIAS_MORA,
    clientes: { activos, archivadas, saldadas, en_cuotas: enCuotas, con_interes: conInteres },
    cartera: {
      financiado, pendiente,
      cobrado_pct: financiado > 0 ? Math.max(0, Math.min(100, ((financiado - pendiente) / financiado) * 100)) : 0,
      cuotas: { cantidad: enCuotas,   pendiente: pendCuotas },
      interes: { cantidad: conInteres, pendiente: pendInteres }
    },
    mora: { cantidad: moraLista.length, monto: moraLista.reduce((s, m) => s + m.pendiente, 0), tramos, cuentas: moraLista },
    cobranzas: { mes_actual: cobranzas[cobranzas.length - 1], meses: cobranzas },
    saldadas: saldadasLista
  });
});

module.exports = router;
