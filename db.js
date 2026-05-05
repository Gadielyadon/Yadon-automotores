const initSqlJs = require('sql.js');
const fs   = require('fs');
const path = require('path');

const DB_PATH   = path.join(__dirname, 'autogest.db');
const BACKUP_DIR = path.join(__dirname, 'backups');
let _db = null;

async function init() {
  const SQL = await initSqlJs();
  _db = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();

  _db.run('PRAGMA foreign_keys = ON;');
  _db.run(`
    CREATE TABLE IF NOT EXISTS clientes (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre          TEXT    NOT NULL,
      telefono        TEXT    DEFAULT '',
      dni             TEXT    DEFAULT '',
      auto_descripcion TEXT   DEFAULT '',
      saldo_inicial   REAL    NOT NULL DEFAULT 0,
      tasa_mensual    REAL    NOT NULL DEFAULT 6,
      modalidad       TEXT    NOT NULL DEFAULT 'interes',
      cuota_fija      REAL    DEFAULT 0,
      total_cuotas    INTEGER DEFAULT 0,
      observaciones   TEXT    DEFAULT '',
      fecha_inicio    TEXT    NOT NULL DEFAULT (date('now')),
      estado          TEXT    NOT NULL DEFAULT 'activo',
      creado_en       TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS movimientos (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id     INTEGER NOT NULL REFERENCES clientes(id),
      fecha          TEXT    NOT NULL,
      saldo_anterior REAL    NOT NULL,
      interes        REAL    NOT NULL DEFAULT 0,
      pago           REAL    NOT NULL DEFAULT 0,
      saldo_nuevo    REAL    NOT NULL,
      abono          INTEGER NOT NULL DEFAULT 0,  -- 1=abonó, 0=no abonó
      numero_recibo  TEXT    DEFAULT '',
      notas          TEXT    DEFAULT '',
      creado_en      TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ventas (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha     TEXT    NOT NULL,
      auto_desc TEXT    NOT NULL,
      precio    REAL    NOT NULL DEFAULT 0,
      comprador TEXT    DEFAULT '',
      notas     TEXT    DEFAULT '',
      creado_en TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS config (
      clave TEXT PRIMARY KEY,
      valor TEXT
    );
  `);

  if (!get("SELECT valor FROM config WHERE clave='ultimo_recibo'"))
    run("INSERT INTO config VALUES ('ultimo_recibo','0')");

  save();
  setInterval(() => save(), 30000);
  setInterval(() => hacerBackup(), 6 * 60 * 60 * 1000);
  hacerBackup();
}

function hacerBackup() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const hoy  = new Date().toISOString().split('T')[0];
    const dest = path.join(BACKUP_DIR, `autogest-${hoy}.db`);
    if (fs.existsSync(dest) || !fs.existsSync(DB_PATH)) return;
    fs.copyFileSync(DB_PATH, dest);
    const arch = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).sort();
    if (arch.length > 30) arch.slice(0, arch.length - 30).forEach(f =>
      fs.unlinkSync(path.join(BACKUP_DIR, f)));
  } catch(e) { console.error('[backup]', e.message); }
}

function save() {
  try {
    if (!_db) return;
    fs.writeFileSync(DB_PATH, Buffer.from(_db.export()));
  } catch(e) { console.error('[save]', e.message); }
}

function run(sql, params = []) {
  _db.run(sql, params);
  const row = get('SELECT last_insert_rowid() as id');
  return { lastInsertRowid: row ? row.id : null };
}

function get(sql, params = []) {
  const stmt = _db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) { const r = stmt.getAsObject(); stmt.free(); return r; }
  stmt.free();
  return null;
}

function query(sql, params = []) {
  const stmt = _db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function siguienteRecibo() {
  const row = get("SELECT valor FROM config WHERE clave='ultimo_recibo'");
  const n   = parseInt(row ? row.valor : '0') + 1;
  run("UPDATE config SET valor=? WHERE clave='ultimo_recibo'", [String(n)]);
  save();
  return String(n).padStart(6, '0');
}

// Saldo actual = último saldo_nuevo registrado, o saldo_inicial si no hay movimientos
function saldoActual(clienteId) {
  const u = get('SELECT saldo_nuevo FROM movimientos WHERE cliente_id=? ORDER BY fecha DESC, id DESC LIMIT 1', [clienteId]);
  if (u) return u.saldo_nuevo;
  const c = get('SELECT saldo_inicial FROM clientes WHERE id=?', [clienteId]);
  return c ? c.saldo_inicial : 0;
}

// Calcula cuánto sería el interés del próximo movimiento (solo lectura, no inserta nada)
function calcularProximoInteres(clienteId) {
  const cliente = get('SELECT * FROM clientes WHERE id=?', [clienteId]);
  if (!cliente) return 0;
  const saldo = saldoActual(clienteId);
  return Math.round(saldo * (cliente.tasa_mensual / 100));
}

module.exports = { init, run, get, query, save, siguienteRecibo, saldoActual, calcularProximoInteres };