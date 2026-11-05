#!/usr/bin/env node
// ─── DIAGNÓSTICO DE CUENTAS EN CUOTAS ────────────────────────────────────────────
// SOLO LEE la base (no modifica nada), se puede correr con el servidor encendido.
//   node diagnostico-cuotas.js
// Lista las cuentas en cuotas y marca las que tienen el "Saldo a financiar" mal cargado
// (por el error del formulario que completaba el saldo con el primer dígito de la cantidad de cuotas).
const fs   = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DB_PATH = path.join(__dirname, 'autogest.db');
const $ = n => '$' + Math.round(n).toLocaleString('es-AR');

(async () => {
  if (!fs.existsSync(DB_PATH)) { console.error('No se encuentra', DB_PATH); process.exit(1); }
  const SQL = await initSqlJs();
  const db  = new SQL.Database(fs.readFileSync(DB_PATH));   // copia en memoria: no escribe nada

  const res = db.exec(`
    SELECT c.id, c.nombre, c.estado, c.cuota_fija, c.total_cuotas, c.saldo_inicial,
           (SELECT COUNT(*) FROM movimientos m WHERE m.cliente_id = c.id AND m.abono = 1) AS pagadas
      FROM clientes c WHERE c.modalidad = 'cuotas' ORDER BY c.nombre`);
  const filas = res.length ? res[0].values : [];

  const sospechosas = [], sinPlan = [], distintas = [];
  console.log(`\nCuentas en cuotas: ${filas.length}\n`);
  for (const [id, nombre, estado, cuota, total, saldo, pagadas] of filas) {
    const totalCuotas = cuota * total;
    let diag = 'OK';
    if (!(cuota > 0) || !(total > 0)) {
      diag = '⚠ SIN CUOTAS CARGADAS (0 cuotas de $0)'; sinPlan.push(nombre);
    } else if (saldo < totalCuotas && Number.isInteger(saldo / cuota)) {
      diag = `⚠ SOSPECHOSA: el saldo a financiar son solo ${saldo / cuota} cuota(s)`; sospechosas.push(nombre);
    } else if (saldo !== totalCuotas) {
      diag = 'saldo distinto al total (puede ser a propósito, ej. capital sin interés)'; distintas.push(nombre);
    }
    console.log(`#${id} ${nombre}${estado === 'archivado' ? ' [archivada]' : ''}`);
    console.log(`     ${total} cuotas de ${$(cuota)} = ${$(totalCuotas)} | saldo a financiar cargado: ${$(saldo)} | pagadas: ${pagadas}`);
    console.log(`     → ${diag}\n`);
  }
  console.log('──────── RESUMEN ────────');
  console.log(`  Sospechosas (hay que corregir): ${sospechosas.length}${sospechosas.length ? '  → ' + sospechosas.join(', ') : ''}`);
  console.log(`  Sin cuotas cargadas:            ${sinPlan.length}${sinPlan.length ? '  → ' + sinPlan.join(', ') : ''}`);
  console.log(`  Saldo distinto al total:        ${distintas.length}${distintas.length ? '  → ' + distintas.join(', ') : ''}`);
  console.log('\nPara corregir una sospechosa: abrí la cuenta → botón "Corregir ahora" (o Editar) → "Usar el total" → Guardar.\n');
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
