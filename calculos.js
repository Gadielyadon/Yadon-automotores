// ─── CÁLCULOS COMPARTIDOS (cuentas, panel) ───────────────────────────────────────
// Un solo lugar con las reglas, para que el panel y las cuentas siempre den los mismos números.

// Fecha de hoy en hora local (YYYY-MM-DD)
function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Días entre dos fechas YYYY-MM-DD (sin problemas de huso horario)
function diasEntre(desde, hasta) {
  const p = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const n = Math.round((p(hasta) - p(desde)) / 86400000);
  return Number.isFinite(n) ? n : NaN;
}

// ¿La cuenta en cuotas tiene el plan completo cargado (valor de cuota y cantidad)?
function tienePlan(c) {
  return c.modalidad === 'cuotas' && c.cuota_fija > 0 && c.total_cuotas > 0;
}

// Monto financiado: en cuotas es cuota × cantidad; en interés, el capital.
function financiadoDe(c) {
  return tienePlan(c) ? c.cuota_fija * c.total_cuotas : c.saldo_inicial;
}

// Saldo pendiente de cobro. En cuotas es el mismo "Saldo restante" que muestra cada cuenta
// (total − cuotas pagadas × valor de cuota); en interés, el saldo actual de la cuenta.
function pendienteDe(c, cuotasPagadas, saldoActual) {
  if (tienePlan(c)) return Math.max(0, c.cuota_fija * c.total_cuotas - cuotasPagadas * c.cuota_fija);
  return Math.max(0, saldoActual || 0);
}

// ¿La cuenta está saldada?
//  - cuotas : SOLO cuando se pagaron todas las cuotas. En estas cuentas el "saldo" arrastrado
//             depende del "Saldo a financiar" cargado al crear el cliente y puede quedar en $0
//             mucho antes de terminar (ej: si se cargó el valor de una cuota), así que no sirve para decidir.
//  - interés: saldo en 0 (y con al menos un movimiento cargado)
function esSaldada(c, saldo, cuotasPagadas, cantMovs) {
  if (cantMovs === 0) return false;
  if (c.modalidad === 'cuotas' && c.total_cuotas > 0) return cuotasPagadas >= c.total_cuotas;
  return saldo <= 0;
}

module.exports = { hoyLocal, diasEntre, tienePlan, financiadoDe, pendienteDe, esSaldada };
