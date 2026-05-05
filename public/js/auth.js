const USERS = {
  'yadonj': 'JAyadon2026',
};
const SESSION_KEY = 'yadon_logged';

function checkLogin() {
  if (sessionStorage.getItem(SESSION_KEY) === '1') {
    document.getElementById('login-screen').classList.remove('show');
    iniciarApp();
  } else {
    document.getElementById('login-screen').classList.add('show');
    setTimeout(() => document.getElementById('login-user').focus(), 100);
  }
}

function doLogin() {
  const user = document.getElementById('login-user').value.trim().toLowerCase();
  const pass = document.getElementById('login-pass').value;
  const err  = document.getElementById('login-error');
  if (USERS[user] && USERS[user] === pass) {
    sessionStorage.setItem(SESSION_KEY, '1');
    document.getElementById('login-screen').classList.remove('show');
    err.classList.remove('show');
    iniciarApp();
  } else {
    err.classList.add('show');
    document.getElementById('login-pass').value = '';
    document.getElementById('login-pass').focus();
  }
}

function doLogout() {
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
}

document.addEventListener('DOMContentLoaded', checkLogin);
