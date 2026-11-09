// ─── LOGIN ───────────────────────────────────────────────────────────────────
// La verificación de usuario y contraseña la hace el SERVIDOR (cookie de sesión segura).
// Acá no se guarda ninguna contraseña.

function mostrarLogin() {
  document.getElementById('login-screen').classList.add('show');
  // Enfoca el usuario solo si todavía no empezaron a escribir (antes le robaba el cursor a quien ya iba por la contraseña)
  setTimeout(() => {
    const u = document.getElementById('login-user'), c = document.getElementById('login-pass');
    const act = document.activeElement;
    if (act !== u && act !== c && !u.value && !c.value) u.focus();
  }, 100);
}

function entrarAlSistema(datos) {
  document.getElementById('login-screen').classList.remove('show');
  document.getElementById('login-error').classList.remove('show');
  iniciarApp();
  // Clave inicial o reseteada: se obliga a elegir una propia
  if (datos.debe_cambiar) abrirCambioClave(true);
}

async function checkLogin() {
  try {
    const r = await fetch('/api/auth/me');
    const d = await r.json();
    if (d.logueado) { entrarAlSistema(d); return; }
  } catch (e) { /* sin conexión: mostramos el login igual */ }
  mostrarLogin();
}

async function doLogin() {
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value;
  const err  = document.getElementById('login-error');
  const btn  = document.querySelector('.login-btn');

  btn.disabled = true;
  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: user, clave: pass })
    });
    const d = await r.json();
    if (r.ok && d.ok) {
      document.getElementById('login-pass').value = '';
      entrarAlSistema(d);
    } else {
      err.textContent = d.error || 'Usuario o contraseña incorrectos';
      err.classList.add('show');
      document.getElementById('login-pass').value = '';
      document.getElementById('login-pass').focus();
    }
  } catch (e) {
    err.textContent = 'No se pudo conectar con el servidor';
    err.classList.add('show');
  } finally {
    btn.disabled = false;
  }
}

async function doLogout() {
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) {}
  location.reload();
}

document.addEventListener('DOMContentLoaded', checkLogin);
