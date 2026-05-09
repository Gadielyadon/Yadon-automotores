const initSqlJs = require('sql.js');
const fs   = require('fs');
const path = require('path');

const DB_PATH    = path.join(__dirname, 'autogest.db');
const BACKUP_DIR = path.join(__dirname, 'backups');
let _db = null;

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  const SQL = await initSqlJs();
  _db = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();

  _db.run('PRAGMA foreign_keys = ON;');
  _db.run(`
    CREATE TABLE IF NOT EXISTS clientes (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre           TEXT    NOT NULL,
      telefono         TEXT    DEFAULT '',
      dni              TEXT    DEFAULT '',
      auto_descripcion TEXT    DEFAULT '',
      saldo_inicial    REAL    NOT NULL DEFAULT 0,
      tasa_mensual     REAL    NOT NULL DEFAULT 6,
      modalidad        TEXT    NOT NULL DEFAULT 'interes',
      cuota_fija       REAL    DEFAULT 0,
      total_cuotas     INTEGER DEFAULT 0,
      observaciones    TEXT    DEFAULT '',
      fecha_inicio     TEXT    NOT NULL DEFAULT (date('now')),
      estado           TEXT    NOT NULL DEFAULT 'activo',
      creado_en        TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS movimientos (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id     INTEGER NOT NULL REFERENCES clientes(id),
      fecha          TEXT    NOT NULL,
      saldo_anterior REAL    NOT NULL,
      interes        REAL    NOT NULL DEFAULT 0,
      pago           REAL    NOT NULL DEFAULT 0,
      saldo_nuevo    REAL    NOT NULL,
      abono          INTEGER NOT NULL DEFAULT 0,
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

  // Guardado inicial
  save();

  // Guardado de seguridad cada 10 segundos (red de contención)
  setInterval(() => save(), 10000);

  // Backup diario cada 6 horas
  setInterval(() => hacerBackup(), 6 * 60 * 60 * 1000);
  hacerBackup();

  console.log('[db] Base de datos iniciada correctamente:', DB_PATH);
}

// ─── BACKUP ───────────────────────────────────────────────────────────────────
function hacerBackup() {
  try {
    if (!fs.existsSync(BACKUP_DIR))
      fs.mkdirSync(BACKUP_DIR, { recursive: true });

    // Primero guardar la versión actual al disco
    save();

    const ahora = new Date();
    const fecha = ahora.toISOString().split('T')[0];
    const hora  = ahora.toTimeString().slice(0,5).replace(':', 'h');
    const dest  = path.join(BACKUP_DIR, `autogest-${fecha}_${hora}.db`);

    if (!fs.existsSync(DB_PATH)) return;
    fs.copyFileSync(DB_PATH, dest);
    console.log('[backup] Creado:', dest);

    // Mantener los últimos 30 backups (no por fecha, sino por cantidad)
    const arch = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.db'))
      .sort();
    if (arch.length > 30)
      arch.slice(0, arch.length - 30)
          .forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f)));
  } catch (e) {
    console.error('[backup] Error:', e.message);
  }
}

// Backup manual con nombre personalizado (usado por el script de deploy)
function hacerBackupManual(nombre) {
  try {
    if (!fs.existsSync(BACKUP_DIR))
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    save();
    const dest = path.join(BACKUP_DIR, nombre);
    if (fs.existsSync(DB_PATH)) {
      fs.copyFileSync(DB_PATH, dest);
      console.log('[backup-manual] Creado:', dest);
    }
    return dest;
  } catch (e) {
    console.error('[backup-manual] Error:', e.message);
    return null;
  }
}

// ─── GUARDAR AL DISCO ─────────────────────────────────────────────────────────
function save() {
  try {
    if (!_db) return;
    const data = Buffer.from(_db.export());
    // Escritura atómica: escribir a .tmp y luego renombrar
    // Así si el proceso se cae a mitad, el archivo original queda intacto
    const tmp = DB_PATH + '.tmp';
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, DB_PATH);
  } catch (e) {
    console.error('[save] Error al guardar:', e.message);
  }
}

// ─── OPERACIONES ──────────────────────────────────────────────────────────────
function run(sql, params = []) {
  _db.run(sql, params);
  const row = get('SELECT last_insert_rowid() as id');
  const result = { lastInsertRowid: row ? row.id : null };
  // Guardar inmediatamente después de CADA escritura
  save();
  return result;
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

// ─── HELPERS DE NEGOCIO ───────────────────────────────────────────────────────
function siguienteRecibo() {
  const row = get("SELECT valor FROM config WHERE clave='ultimo_recibo'");
  const n   = parseInt(row ? row.valor : '0') + 1;
  // run() ya llama a save(), no hace falta llamarlo de nuevo
  _db.run("UPDATE config SET valor=? WHERE clave='ultimo_recibo'", [String(n)]);
  save();
  return String(n).padStart(6, '0');
}

function saldoActual(clienteId) {
  const u = get(
    'SELECT saldo_nuevo FROM movimientos WHERE cliente_id=? ORDER BY fecha DESC, id DESC LIMIT 1',
    [clienteId]
  );
  if (u) return u.saldo_nuevo;
  const c = get('SELECT saldo_inicial FROM clientes WHERE id=?', [clienteId]);
  return c ? c.saldo_inicial : 0;
}

function calcularProximoInteres(clienteId) {
  const cliente = get('SELECT * FROM clientes WHERE id=?', [clienteId]);
  if (!cliente) return 0;
  const saldo = saldoActual(clienteId);
  return Math.round(saldo * (cliente.tasa_mensual / 100));
}

module.exports = {
  init,
  run,
  get,
  query,
  save,
  hacerBackup,
  hacerBackupManual,
  siguienteRecibo,
  saldoActual,
  calcularProximoInteres
};