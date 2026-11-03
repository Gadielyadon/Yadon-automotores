const express = require('express');
const router  = express.Router();
const auth    = require('../auth');
const db      = require('../db');

// ¿Hay sesión? (el navegador lo consulta al abrir la página)
router.get('/me', (req, res) => {
  const u = auth.sesionDe(req);
  if (!u) return res.json({ logueado: false });
  res.json({ logueado: true, usuario: u.usuario, debe_cambiar: !!u.debe_cambiar });
});

router.post('/login', (req, res) => {
  const usuario = String(req.body.usuario || '').trim().toLowerCase();
  const clave   = String(req.body.clave || '');
  const ip      = req.ip;

  const bloqueo = auth.minutosBloqueado(ip);
  if (bloqueo > 0)
    return res.status(429).json({ error: `Demasiados intentos. Probá de nuevo en ${bloqueo} minuto${bloqueo > 1 ? 's' : ''}.` });

  const u = auth.verificarLogin(usuario, clave);
  if (!u) {
    auth.registrarFallo(ip);
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  auth.limpiarFallos(ip);
  auth.ponerCookie(req, res, auth.crearSesion(u.id));
  res.json({ ok: true, usuario: u.usuario, debe_cambiar: !!u.debe_cambiar });
});

router.post('/logout', (req, res) => {
  auth.cerrarSesion(req);
  auth.borrarCookie(res);
  res.json({ ok: true });
});

// Cambiar la propia contraseña (requiere sesión). Devuelve 400 (no 401) si la actual está mal.
router.post('/cambiar-clave', auth.requireAuth, (req, res) => {
  const actual = String(req.body.actual || '');
  const nueva  = String(req.body.nueva  || '');
  const u = db.get('SELECT * FROM usuarios WHERE id=?', [req.usuario.id]);

  if (!auth.claveCorrecta(actual, u.salt, u.hash))
    return res.status(400).json({ error: 'La contraseña actual no es correcta' });
  if (nueva.length < auth.MIN_CLAVE)
    return res.status(400).json({ error: `La nueva contraseña debe tener al menos ${auth.MIN_CLAVE} caracteres` });
  if (nueva === actual)
    return res.status(400).json({ error: 'La nueva contraseña tiene que ser distinta de la actual' });

  auth.cambiarClave(u.id, nueva, auth.tokenHashDe(req));
  res.json({ ok: true });
});

module.exports = router;
