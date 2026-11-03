// ─── SEGURIDAD: usuarios, contraseñas y sesiones (solo módulos nativos de Node) ───
const crypto = require('crypto');
const db     = require('./db');

const COOKIE        = 'autogest_sid';
const SESION_HORAS  = 12;     // la sesión dura 12 hs
const MAX_INTENTOS  = 5;      // intentos fallidos permitidos por IP
const BLOQUEO_MIN   = 15;     // minutos de bloqueo al pasarse
const MIN_CLAVE     = 8;

// Usuario inicial (solo se crea si la tabla está vacía). Se obliga a cambiar la clave al primer ingreso.
const USUARIO_INICIAL = 'yadonj';
const CLAVE_INICIAL   = 'JAyadon2026';

// ── Contraseñas: scrypt con sal propia (nunca se guarda la clave en texto) ──
function hashClave(clave, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  return { salt, hash: crypto.scryptSync(clave, salt, 64).toString('hex') };
}
function claveCorrecta(clave, salt, hash) {
  const calc = crypto.scryptSync(clave, salt, 64);
  const esp  = Buffer.from(hash, 'hex');
  return calc.length === esp.length && crypto.timingSafeEqual(calc, esp);
}

// ── Usuarios ──
function initUsuarios() {
  if (db.get('SELECT id FROM usuarios LIMIT 1')) return;
  const { salt, hash } = hashClave(CLAVE_INICIAL);
  db.run('INSERT INTO usuarios (usuario, salt, hash, debe_cambiar) VALUES (?,?,?,1)',
    [USUARIO_INICIAL, salt, hash]);
  console.log(`[auth] Usuario inicial creado: "${USUARIO_INICIAL}" (se pedirá cambiar la clave al ingresar)`);
}

// Devuelve el usuario si usuario/clave son correctos; si no, null.
// Si el usuario no existe igual se calcula un hash, para que no se pueda adivinar qué usuarios existen por el tiempo de respuesta.
function verificarLogin(usuario, clave) {
  const u = db.get('SELECT * FROM usuarios WHERE usuario=?', [usuario]);
  if (!u) { hashClave(clave, '0'.repeat(32)); return null; }
  return claveCorrecta(clave, u.salt, u.hash) ? u : null;
}

function cambiarClave(usuarioId, nueva, tokenHashActual) {
  const { salt, hash } = hashClave(nueva);
  db.run('UPDATE usuarios SET salt=?, hash=?, debe_cambiar=0 WHERE id=?', [salt, hash, usuarioId]);
  // cierra las demás sesiones de ese usuario (queda abierta solo la actual)
  db.run('DELETE FROM sesiones WHERE usuario_id=? AND token_hash<>?', [usuarioId, tokenHashActual || '']);
}

// Usado por reset-password.js: crea el usuario si no existe, o le cambia la clave, y cierra todas sus sesiones.
function resetearClave(usuario, clave) {
  const { salt, hash } = hashClave(clave);
  const u = db.get('SELECT id FROM usuarios WHERE usuario=?', [usuario]);
  let creado = false;
  if (u) {
    db.run('UPDATE usuarios SET salt=?, hash=?, debe_cambiar=1 WHERE id=?', [salt, hash, u.id]);
    db.run('DELETE FROM sesiones WHERE usuario_id=?', [u.id]);
  } else {
    db.run('INSERT INTO usuarios (usuario, salt, hash, debe_cambiar) VALUES (?,?,?,1)', [usuario, salt, hash]);
    creado = true;
  }
  return { creado };
}

function claveTemporal() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; // sin caracteres confusos (0/O, 1/l/I)
  let s = '';
  for (let i = 0; i < 12; i++) s += abc[crypto.randomInt(abc.length)];
  return s;
}

// ── Sesiones (cookie HttpOnly con token aleatorio; en la base se guarda solo su hash) ──
const sha = t => crypto.createHash('sha256').update(t).digest('hex');

function leerCookie(req, nombre) {
  for (const parte of (req.headers.cookie || '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nombre) {
      try { return decodeURIComponent(parte.slice(i + 1).trim()); } catch (e) { return null; }
    }
  }
  return null;
}

function crearSesion(usuarioId) {
  db.run('DELETE FROM sesiones WHERE expira < ?', [Date.now()]);
  const token = crypto.randomBytes(32).toString('hex');
  db.run('INSERT INTO sesiones (token_hash, usuario_id, expira) VALUES (?,?,?)',
    [sha(token), usuarioId, Date.now() + SESION_HORAS * 3600 * 1000]);
  return token;
}

function esHttps(req) {
  return req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https';
}

function ponerCookie(req, res, token) {
  res.setHeader('Set-Cookie',
    `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESION_HORAS * 3600}` +
    (esHttps(req) ? '; Secure' : ''));
}
function borrarCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

function tokenHashDe(req) {
  const t = leerCookie(req, COOKIE);
  return t ? sha(t) : null;
}

function sesionDe(req) {
  const th = tokenHashDe(req);
  if (!th) return null;
  return db.get(
    `SELECT u.id, u.usuario, u.debe_cambiar
       FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash=? AND s.expira>?`, [th, Date.now()]);
}

function cerrarSesion(req) {
  const th = tokenHashDe(req);
  if (th) db.run('DELETE FROM sesiones WHERE token_hash=?', [th]);
}

// Middleware: deja pasar solo con sesión válida
function requireAuth(req, res, next) {
  const u = sesionDe(req);
  if (!u) return res.status(401).json({ error: 'Sesión no iniciada o vencida' });
  req.usuario = u;
  next();
}

// ── Límite de intentos fallidos por IP ──
const fallos = new Map(); // ip -> { n, hasta, ultimo }

function minutosBloqueado(ip) {
  const f = fallos.get(ip);
  if (!f || !f.hasta) return 0;
  const resta = f.hasta - Date.now();
  if (resta <= 0) { fallos.delete(ip); return 0; }
  return Math.ceil(resta / 60000);
}
function registrarFallo(ip) {
  let f = fallos.get(ip);
  if (!f || Date.now() - f.ultimo > BLOQUEO_MIN * 60000) f = { n: 0, hasta: 0, ultimo: 0 };
  f.n++; f.ultimo = Date.now();
  if (f.n >= MAX_INTENTOS) f.hasta = Date.now() + BLOQUEO_MIN * 60000;
  fallos.set(ip, f);
}
function limpiarFallos(ip) { fallos.delete(ip); }

module.exports = {
  MIN_CLAVE, COOKIE,
  initUsuarios, verificarLogin, claveCorrecta, hashClave, cambiarClave, resetearClave, claveTemporal,
  crearSesion, ponerCookie, borrarCookie, sesionDe, tokenHashDe, cerrarSesion, requireAuth,
  minutosBloqueado, registrarFallo, limpiarFallos
};
