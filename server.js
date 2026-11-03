const express = require('express');
const path    = require('path');
const db      = require('./db');
const auth    = require('./auth');

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY'); // que no se pueda embeber en otra página
  next();
});
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Login/logout/cambio de clave (públicas, manejan su propia seguridad)
app.use('/api/auth', require('./routes/auth'));
// TODO lo demás de /api exige sesión iniciada
app.use('/api', auth.requireAuth);

app.use('/api/clientes',    require('./routes/clientes'));
app.use('/api/movimientos', require('./routes/movimientos'));
app.use('/api/recibo',      require('./routes/recibo'));
app.use('/api/ventas',      require('./routes/ventas'));
app.use('/api/exportar',    require('./routes/exportar'));
app.use('/api/recibo-manual', require('./routes/recibo-manual'));

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3005;
db.init().then(() => {
  auth.initUsuarios();
  app.listen(PORT, () => console.log(`AutoGest corriendo en http://localhost:${PORT}`));
}).catch(err => { console.error('Error DB:', err); process.exit(1); });