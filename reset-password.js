#!/usr/bin/env node
// ─── RECUPERAR / RESETEAR CONTRASEÑA ────────────────────────────────────────────
// Uso (con el servidor APAGADO):
//   node reset-password.js                       → resetea al usuario "yadonj" con una clave temporal
//   node reset-password.js otrousuario           → resetea (o crea) a ese usuario
//   node reset-password.js yadonj MiClave1234    → le pone esa clave (mínimo 8 caracteres)
// Al ingresar con la clave nueva, el sistema obliga a elegir una propia.
const net  = require('net');
const db   = require('./db');
const auth = require('./auth');

const PORT = process.env.PORT || 3005;

function servidorCorriendo() {
  return new Promise(resolve => {
    const s = net.connect({ port: PORT, host: '127.0.0.1' });
    s.setTimeout(1500);
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('timeout', () => { s.destroy(); resolve(false); });
    s.on('error',   () => resolve(false));
  });
}

(async () => {
  const usuario = (process.argv[2] || 'yadonj').trim().toLowerCase();
  const clave   = process.argv[3] || auth.claveTemporal();

  if (clave.length < auth.MIN_CLAVE) {
    console.error(`\n✗ La contraseña debe tener al menos ${auth.MIN_CLAVE} caracteres.\n`);
    process.exit(1);
  }

  // El servidor guarda su copia en memoria cada pocos segundos: si estuviera prendido, pisaría este cambio.
  if (await servidorCorriendo()) {
    console.error(`\n✗ El servidor está encendido (puerto ${PORT}).`);
    console.error('  Apagalo primero (Ctrl+C en su ventana), corré este comando de nuevo y después volvé a iniciarlo con "npm start".\n');
    process.exit(1);
  }

  await db.init(); // también deja un backup de la base antes de cambiar nada
  const { creado } = auth.resetearClave(usuario, clave);
  db.save();

  console.log('\n──────────────────────────────────────────');
  console.log(creado ? ' Usuario CREADO' : ' Contraseña RESETEADA');
  console.log(`   Usuario:    ${usuario}`);
  console.log(`   Contraseña: ${clave}`);
  console.log('──────────────────────────────────────────');
  console.log(' Al ingresar se le va a pedir elegir una contraseña propia.');
  console.log(' Ahora iniciá el servidor de nuevo con: npm start\n');
  process.exit(0);
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
