const express = require('express');
const path    = require('path');
const db      = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/clientes',    require('./routes/clientes'));
app.use('/api/movimientos', require('./routes/movimientos'));
app.use('/api/recibo',      require('./routes/recibo'));
app.use('/api/ventas',      require('./routes/ventas'));
app.use('/api/exportar',    require('./routes/exportar'));

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3001;
db.init().then(() => {
  app.listen(PORT, () => console.log(`AutoGest corriendo en http://localhost:${PORT}`));
}).catch(err => { console.error('Error DB:', err); process.exit(1); });