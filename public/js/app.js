// ═══ FORMATO NUMÉRICO CON PUNTOS ═════════════════════════════════
function fmtInput(input) {
  const pos = input.selectionStart;
  const prevLen = input.value.length;
  let raw = input.value.replace(/\./g, '').replace(/[^0-9]/g, '');
  if (raw === '') { input.value = ''; return; }
  const formatted = parseInt(raw, 10).toLocaleString('es-AR').replace(/,/g, '.');
  input.value = formatted;
  const diff = formatted.length - prevLen;
  try { input.setSelectionRange(pos + diff, pos + diff); } catch(e) {}
}
function getNumVal(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  return parseFloat(el.value.replace(/\./g, '').replace(',', '.')) || 0;
}

let _clientes = [];
let _clienteActual = null;
let _reciboMovId = null;

// ═══ INIT ════════════════════════════════════════════════════════
function iniciarApp() {
  document.querySelectorAll('.nav-link').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      navegarA(a.dataset.page);
      if (window.innerWidth <= 768) cerrarSidebar();
    });
  });
  const hoy = new Date();
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`;
  const filtro = document.getElementById('ventas-mes-filtro');
  if (filtro) filtro.value = mesActual;
  navegarA('dashboard');
}

function navegarA(page) {
  document.querySelectorAll('.nav-link').forEach(a =>
    a.classList.toggle('active', a.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  const titulos = { dashboard:'Panel', cuentas:'Cuentas Corrientes', ventas:'Ventas', calculadora:'Calculadora' };
  document.getElementById('topbar-title').textContent = titulos[page] || page;
  if (page === 'dashboard')   cargarDashboard();
  if (page === 'cuentas')     cargarListaClientes();
  if (page === 'ventas')      cargarVentas();
  if (page === 'calculadora') calcularCuotas();
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
function cerrarSidebar()  { document.getElementById('sidebar').classList.remove('open'); }

// ═══ HELPERS ═════════════════════════════════════════════════════
function fmt(n) {
  if (n === null || n === undefined) return '—';
  return '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtFecha(f) {
  if (!f) return '—';
  const [y,m,d] = f.split('-');
  return `${d}/${m}/${y}`;
}
function mesLabel(mesStr) {
  if (!mesStr) return '';
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const [y,m] = mesStr.split('-');
  return `${meses[parseInt(m)-1]} ${y}`;
}
function mesConcepto(fechaStr) {
  if (!fechaStr) return '';
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const [y,m] = fechaStr.split('-');
  return `Corresponde a cuota del mes de ${meses[parseInt(m)-1]} de ${y}`;
}
function inicialNombre(n) {
  return (n||'?').split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase();
}
function diasDesde(fechaStr) {
  const d   = new Date(fechaStr + 'T00:00:00');
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const diff = Math.round((hoy - d) / 86400000);
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'ayer';
  if (diff < 30)  return `hace ${diff} días`;
  return `hace ${Math.floor(diff/30)} mes${Math.floor(diff/30)>1?'es':''}`;
}
async function api(url, opts={}) {
  const r = await fetch(url, { headers:{'Content-Type':'application/json'}, ...opts });
  return r.json();
}
function toast(msg, tipo='ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${tipo} show`;
  setTimeout(() => t.classList.remove('show'), 3200);
}
function emptyState(msg) {
  return `<div class="empty-state">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/>
    </svg><p>${msg}</p></div>`;
}

// ═══ DASHBOARD ═══════════════════════════════════════════════════
async function cargarDashboard() {
  const clientes = await api('/api/clientes');
  _clientes = clientes;
  const activos = clientes.filter(c => c.estado === 'activo');

  const hoy = new Date();
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`;

  const ventasDelMes = await api(`/api/ventas?mes=${mesActual}`);
  const dvCont = document.getElementById('dash-ventas-mes');
  if (!ventasDelMes.length) {
    dvCont.innerHTML = `<div class="empty-state" style="padding:1.5rem"><p>Sin ventas registradas este mes.</p></div>`;
  } else {
    dvCont.innerHTML = `<div class="table-wrap"><table class="mov-table">
      <thead><tr><th>Fecha</th><th>Vehículo</th><th>Comprador</th><th>Precio</th></tr></thead>
      <tbody>${ventasDelMes.map(v => `<tr>
        <td>${fmtFecha(v.fecha)}</td>
        <td><strong>${v.auto_desc}</strong></td>
        <td>${v.comprador || '—'}</td>
        <td><strong style="color:var(--green)">${fmt(v.precio)}</strong></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  const cont = document.getElementById('dashboard-clientes');
  cont.innerHTML = activos.length === 0
    ? emptyState('Sin clientes activos.')
    : activos.map(clienteCardHTML).join('');
  cont.querySelectorAll('.cliente-card').forEach(el =>
    el.addEventListener('click', () => abrirCuenta(parseInt(el.dataset.id))));
}

// ═══ LISTA CLIENTES ═══════════════════════════════════════════════
async function cargarListaClientes() {
  mostrarVistaLista();
  const clientes = await api('/api/clientes');
  _clientes = clientes;
  renderListaClientes(clientes);
}

function renderListaClientes(lista) {
  const cont = document.getElementById('lista-clientes');
  if (!lista.length) {
    cont.innerHTML = emptyState('No hay clientes. Usá <strong>Nuevo cliente</strong> para agregar uno.');
    return;
  }
  cont.innerHTML = lista.map(clienteCardHTML).join('');
  cont.querySelectorAll('.cliente-card').forEach(el =>
    el.addEventListener('click', () => abrirCuenta(parseInt(el.dataset.id))));
}

function clienteCardHTML(c) {
  const saldo = c.saldo_actual || 0;
  const ultimoStr = c.ultimo_movimiento
    ? `Último mov: ${fmtFecha(c.ultimo_movimiento)} (${diasDesde(c.ultimo_movimiento)})`
    : 'Sin movimientos aún';
  return `<div class="cliente-card" data-id="${c.id}">
    <div class="cliente-avatar">${inicialNombre(c.nombre)}</div>
    <div class="cliente-info">
      <div class="cliente-nombre">${c.nombre}</div>
      <div class="cliente-auto">${c.auto_descripcion || 'Sin vehículo cargado'}</div>
      <span style="font-size:.72rem;color:var(--text-muted)">${ultimoStr}</span>
    </div>
    <div class="cliente-saldo">
      <div class="saldo-num">${fmt(saldo)}</div>
      <div class="saldo-lbl">saldo actual</div>
    </div>
  </div>`;
}

function filtrarClientes() {
  const q = document.getElementById('search-input').value.toLowerCase();
  renderListaClientes(_clientes.filter(c =>
    c.nombre.toLowerCase().includes(q) ||
    (c.auto_descripcion||'').toLowerCase().includes(q)));
}

// ═══ CUENTA CORRIENTE ════════════════════════════════════════════
async function abrirCuenta(id) {
  navegarA('cuentas');
  const cliente = await api(`/api/clientes/${id}`);
  _clienteActual = cliente;

  document.getElementById('vista-lista').style.display = 'none';
  document.getElementById('vista-cuenta').style.display = 'block';
  document.getElementById('cuenta-nombre').textContent = cliente.nombre;
  document.getElementById('cuenta-auto').textContent   = cliente.auto_descripcion || '';

  const esCuotas = cliente.modalidad === 'cuotas';

  // ── Calcular cuadritos según modalidad
  const movs = await api(`/api/movimientos/${id}`);
  const cuotasPagadas = movs.filter(m => m.abono === 1).length;

  const saldoAFinanciar = cliente.saldo_inicial;
  const cuotasLabel     = `Cuota ${cuotasPagadas} de ${cliente.total_cuotas}`;
  const modalLabel      = esCuotas
    ? `${cliente.total_cuotas} cuotas de ${fmt(cliente.cuota_fija)}`
    : `Interés ${cliente.tasa_mensual}% mensual`;

  let resumenHTML = '';

  if (esCuotas) {
    // Cuotas fijas: saldo restante = total - cuotas ya pagadas
    const totalFinanciado  = (cliente.cuota_fija || 0) * (cliente.total_cuotas || 0);
    const saldoRestante    = totalFinanciado - (cuotasPagadas * (cliente.cuota_fija || 0));

    resumenHTML = `
      <div class="resumen-item">
        <div class="r-lbl">Saldo a financiar</div>
        <div class="r-val">${fmt(saldoAFinanciar)}</div>
      </div>
      <div class="resumen-item">
        <div class="r-lbl">Saldo restante</div>
        <div class="r-val rojo">${fmt(saldoRestante)}</div>
      </div>
      <div class="resumen-item">
        <div class="r-lbl">Modalidad</div>
        <div class="r-val" style="font-size:.85rem">${modalLabel}</div>
      </div>
      <div class="resumen-item">
        <div class="r-lbl">Estado cuotas</div>
        <div class="r-val" style="color:var(--blue);font-size:.9rem;font-weight:800">${cuotasLabel}</div>
      </div>`;
  } else {
    // Interés mensual: saldo total acumulado con intereses
    const totalIntereses   = movs.reduce((s, m) => s + (m.interes || 0), 0);
    const saldoTotalConInt = saldoAFinanciar + totalIntereses;

    resumenHTML = `
      <div class="resumen-item">
        <div class="r-lbl">Saldo a financiar</div>
        <div class="r-val">${fmt(saldoAFinanciar)}</div>
      </div>
      <div class="resumen-item">
        <div class="r-lbl">Saldo total c/ interés</div>
        <div class="r-val" style="color:var(--orange)">${fmt(saldoTotalConInt)}</div>
      </div>
      <div class="resumen-item">
        <div class="r-lbl">Saldo actual</div>
        <div class="r-val rojo">${fmt(cliente.saldo_actual)}</div>
      </div>
      <div class="resumen-item">
        <div class="r-lbl">Modalidad</div>
        <div class="r-val" style="font-size:.85rem">${modalLabel}</div>
      </div>
      <div class="resumen-item">
        <div class="r-lbl">Próximo interés</div>
        <div class="r-val" style="color:var(--orange)">${fmt(cliente.proximo_interes)}</div>
      </div>`;
  }

  if (cliente.observaciones) {
    resumenHTML += `<div class="resumen-item" style="grid-column:1/-1">
      <div class="r-lbl">Observaciones</div>
      <div style="font-size:.83rem;color:var(--text-2);margin-top:.3rem">${cliente.observaciones}</div>
    </div>`;
  }

  document.getElementById('cuenta-resumen').innerHTML = resumenHTML;
  await cargarMovimientos(id, movs);
}

async function cargarMovimientos(clienteId, movsCache) {
  const cliente = _clienteActual;
  const esCuotas = cliente && cliente.modalidad === 'cuotas';
  const movs  = movsCache || await api(`/api/movimientos/${clienteId}`);
  const tbody = document.getElementById('mov-tbody');

  // Mostrar/ocultar columnas Interés y Saldo nuevo según modalidad
  const thInteres    = document.getElementById('th-interes');
  const thSaldoNuevo = document.getElementById('th-saldo-nuevo');
  if (thInteres)    thInteres.style.display    = esCuotas ? 'none' : '';
  if (thSaldoNuevo) thSaldoNuevo.style.display = esCuotas ? 'none' : '';

  if (!movs.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:2.5rem;font-size:.88rem">
      Sin movimientos. Registrá el primero con <strong>+ Nuevo movimiento</strong>.
    </td></tr>`;
    return;
  }

  // Contar cuotas pagadas para numerarlas
  let contadorCuotas = 0;
  const totalCuotas = cliente ? (cliente.total_cuotas || 0) : 0;

  tbody.innerHTML = movs.map(m => {
    const esAbono   = m.abono === 1;
    if (esAbono) contadorCuotas++;

    // Columna ESTADO — visible y destacada
    let estadoCell;
    if (esCuotas && esAbono) {
      estadoCell = `<td class="estado-cell"><span class="badge-pagado">✓ PAGADO<br><small>Cuota ${contadorCuotas} de ${totalCuotas}</small></span></td>`;
    } else if (esAbono) {
      estadoCell = `<td class="estado-cell"><span class="badge-pagado">✓ PAGADO</span></td>`;
    } else {
      estadoCell = `<td class="estado-cell"><span class="badge-no-pago">✗ NO PAGÓ</span></td>`;
    }

    const abonoCell = esAbono
      ? `<span class="monto-verde">${fmt(m.pago)}</span>`
      : `<span style="color:var(--text-muted)">—</span>`;
    const saldoClass = m.saldo_nuevo === 0 ? 'monto-verde' : 'monto-rojo';
    const reciboBtn  = (esAbono && m.numero_recibo)
      ? `<button class="btn-recibo" onclick="abrirModalRecibo(${m.id})">📄 #${m.numero_recibo}</button>`
      : '—';
    const nota = m.notas ? `<span title="${m.notas}" style="cursor:default">📝</span> ` : '';

    return `<tr>
      <td><strong>${fmtFecha(m.fecha)}</strong></td>
      ${estadoCell}
      <td>${fmt(m.saldo_anterior)}</td>
      ${!esCuotas ? `<td><span class="monto-naranja">+${fmt(m.interes)}</span></td>` : ''}
      <td>${abonoCell}</td>
      ${!esCuotas ? `<td><span class="${saldoClass}">${fmt(m.saldo_nuevo)}</span></td>` : ''}
      <td>${reciboBtn}</td>
      <td>${nota}<button class="btn-eliminar" onclick="eliminarMovimiento(${m.id})" title="Eliminar">✕</button></td>
    </tr>`;
  }).join('');
}

function volverLista() { mostrarVistaLista(); cargarListaClientes(); }
function mostrarVistaLista() {
  document.getElementById('vista-lista').style.display  = 'block';
  document.getElementById('vista-cuenta').style.display = 'none';
  _clienteActual = null;
}

// ═══ MODAL RECIBO ═════════════════════════════════════════════════
async function abrirModalRecibo(movId) {
  _reciboMovId = movId;
  const movs = await api(`/api/movimientos/${_clienteActual.id}`);
  const mov  = movs.find(m => m.id === movId);
  if (!mov) return;

  const esCuotas = _clienteActual.modalidad === 'cuotas';
  const cuotasPagadas = esCuotas ? movs.filter(m => m.abono === 1 && m.id <= movId).length : null;

  // Info resumen del recibo (siempre igual)
  document.getElementById('recibo-info').innerHTML = `
    <div><div class="pi-lbl">Cliente</div><div class="pi-val">${_clienteActual.nombre}</div></div>
    <div><div class="pi-lbl">N° Recibo</div><div class="pi-val">#${mov.numero_recibo}</div></div>
    <div><div class="pi-lbl">Fecha</div><div class="pi-val">${fmtFecha(mov.fecha)}</div></div>
    <div><div class="pi-lbl">Monto abonado</div><div class="pi-val verde">${fmt(mov.pago)}</div></div>
    ${esCuotas ? `<div><div class="pi-lbl">Cuota</div><div class="pi-val">${cuotasPagadas} de ${_clienteActual.total_cuotas}</div></div>` : ''}
    <div><div class="pi-lbl">Saldo restante</div><div class="pi-val ${mov.saldo_nuevo > 0 ? 'rojo' : 'verde'}">${fmt(mov.saldo_nuevo)}</div></div>
  `;

  // Concepto/observación: para cuotas sugiere texto, para interés lo deja en blanco para escribir libremente
  if (esCuotas) {
    document.getElementById('recibo-concepto').value =
      `Cuota ${cuotasPagadas} de ${_clienteActual.total_cuotas} — ${_clienteActual.auto_descripcion || ''}`;
    document.getElementById('recibo-concepto-label').textContent = 'Concepto del recibo';
    document.getElementById('recibo-concepto-hint').textContent  = 'Podés editar el texto antes de generar el PDF.';
  } else {
    document.getElementById('recibo-concepto').value = '';
    document.getElementById('recibo-concepto-label').textContent = 'Observación / nota para el recibo';
    document.getElementById('recibo-concepto-hint').textContent  = 'Escribí lo que quieras que aparezca en el recibo (opcional).';
  }

  abrirModal('modal-recibo');
}

function generarReciboPDF() {
  const concepto = encodeURIComponent(document.getElementById('recibo-concepto').value.trim());
  window.open(`/api/recibo/${_reciboMovId}?concepto=${concepto}`, '_blank');
  cerrarModal('modal-recibo');
}

// ═══ MODAL NUEVO MOVIMIENTO ═══════════════════════════════════════
function abrirNuevoMovimiento() {
  if (!_clienteActual) return;
  const c = _clienteActual;
  const esCuotas = c.modalidad === 'cuotas';

  document.getElementById('m-fecha').value = new Date().toISOString().split('T')[0];
  document.getElementById('m-notas').value = '';
  document.getElementById('m-recargo').value = '';

  // Para cuotas fijas, pre-llenar con el monto de cuota
  if (esCuotas && c.cuota_fija) {
    document.getElementById('m-pago').value = c.cuota_fija.toLocaleString('es-AR').replace(/,/g, '.');
  } else {
    document.getElementById('m-pago').value = '';
  }

  // Mostrar/ocultar campo recargo según modalidad
  const seccionRecargo = document.getElementById('seccion-recargo');
  if (seccionRecargo) seccionRecargo.style.display = esCuotas ? 'block' : 'none';

  const saldoConInt = esCuotas ? c.saldo_actual : c.saldo_actual + c.proximo_interes;

  document.getElementById('m-info').innerHTML = esCuotas ? `
    <div><div class="pi-lbl">Saldo pendiente</div><div class="pi-val rojo">${fmt(c.saldo_actual)}</div></div>
    <div><div class="pi-lbl">Cuota mensual</div><div class="pi-val">${fmt(c.cuota_fija)}</div></div>
  ` : `
    <div><div class="pi-lbl">Saldo anterior</div><div class="pi-val">${fmt(c.saldo_actual)}</div></div>
    <div><div class="pi-lbl">Interés ${c.tasa_mensual}%</div><div class="pi-val" style="color:var(--orange)">+ ${fmt(c.proximo_interes)}</div></div>
    <div><div class="pi-lbl">Con interés</div><div class="pi-val rojo">${fmt(saldoConInt)}</div></div>
    <div><div class="pi-lbl">Fecha</div><div class="pi-val" style="font-size:.85rem">${new Date().toLocaleDateString('es-AR')}</div></div>
  `;
  seleccionarEstado('abono');
  actualizarPreviewPago();
  abrirModal('modal-movimiento');
  setTimeout(() => document.getElementById('m-pago').focus(), 100);
}

function aplicarRecargo() {
  if (!_clienteActual) return;
  const pct = parseFloat(document.getElementById('m-recargo').value) || 0;
  if (pct <= 0) return;
  const base = _clienteActual.cuota_fija || getNumVal('m-pago');
  const recargo = Math.round(base * pct / 100);
  const total = base + recargo;
  document.getElementById('m-pago').value = total.toLocaleString('es-AR').replace(/,/g, '.');
  actualizarPreviewPago();
  toast(`Recargo ${pct}% aplicado: ${fmt(recargo)} extra → Total ${fmt(total)}`);
}

function seleccionarEstado(estado) {
  document.getElementById('btn-abono').classList.toggle('activo',    estado === 'abono');
  document.getElementById('btn-no-abono').classList.toggle('activo', estado === 'no-abono');
  document.getElementById('seccion-pago').style.display = estado === 'abono' ? 'block' : 'none';
  document.getElementById('m-estado').value = estado;
  if (estado === 'abono') setTimeout(() => document.getElementById('m-pago').focus(), 50);
  actualizarPreviewPago();
}

function actualizarPreviewPago() {
  if (!_clienteActual) return;
  const c = _clienteActual;
  const esCuotas = c.modalidad === 'cuotas';
  const estado      = document.getElementById('m-estado').value;
  const saldoConInt = esCuotas ? c.saldo_actual : c.saldo_actual + c.proximo_interes;
  const prev        = document.getElementById('m-preview');

  if (estado === 'no-abono') {
    prev.innerHTML = esCuotas ? `
      <div><div class="pi-lbl">Saldo sin cambios</div><div class="pi-val rojo">${fmt(c.saldo_actual)}</div></div>
      <div><div class="pi-lbl">Estado</div><div class="pi-val"><span class="badge badge-orange">No abonó</span></div></div>` : `
      <div><div class="pi-lbl">Nuevo saldo</div><div class="pi-val rojo">${fmt(saldoConInt)}</div></div>
      <div><div class="pi-lbl">Estado</div><div class="pi-val"><span class="badge badge-orange">No abonó</span></div></div>`;
    prev.style.display = 'grid';
    return;
  }
  const pago = getNumVal('m-pago');
  if (pago <= 0) { prev.style.display = 'none'; return; }
  const saldoNuevo = Math.max(0, saldoConInt - pago);
  prev.innerHTML = `
    <div><div class="pi-lbl">Abona</div><div class="pi-val verde">${fmt(pago)}</div></div>
    <div><div class="pi-lbl">Saldo restante</div><div class="pi-val ${saldoNuevo > 0 ? 'rojo' : 'verde'}">${fmt(saldoNuevo)}</div></div>`;
  prev.style.display = 'grid';
}

async function confirmarMovimiento() {
  if (!_clienteActual) return;
  const fecha  = document.getElementById('m-fecha').value;
  const estado = document.getElementById('m-estado').value;
  const pago   = getNumVal('m-pago');
  const notas  = document.getElementById('m-notas').value.trim();
  if (!fecha) { toast('La fecha es obligatoria', 'err'); return; }
  if (estado === 'abono' && pago <= 0) { toast('Ingresá el monto abonado', 'err'); return; }
  try {
    const r = await api(`/api/movimientos/${_clienteActual.id}`, {
      method: 'POST', body: JSON.stringify({ fecha, abono: estado === 'abono', pago, notas })
    });
    if (r.error) { toast(r.error, 'err'); return; }
    cerrarModal('modal-movimiento');
    toast(estado === 'abono' ? `Pago registrado — Recibo #${r.numero_recibo} ✓` : 'Movimiento registrado ✓');
    await abrirCuenta(_clienteActual.id);
  } catch(e) { toast('Error al guardar', 'err'); }
}

async function eliminarMovimiento(id) {
  if (!confirm('¿Eliminar este movimiento?')) return;
  await api(`/api/movimientos/${id}`, { method: 'DELETE' });
  toast('Movimiento eliminado');
  await abrirCuenta(_clienteActual.id);
}

// ═══ VENTAS ═══════════════════════════════════════════════════════
async function cargarVentas() {
  const mes    = document.getElementById('ventas-mes-filtro')?.value || '';
  const ventas = await api(`/api/ventas${mes ? `?mes=${mes}` : ''}`);

  document.getElementById('ventas-cant-mes').textContent  = ventas.length;
  const total = ventas.reduce((s,v) => s + (v.precio||0), 0);
  document.getElementById('ventas-total-mes').textContent = fmt(total);

  const tbody = document.getElementById('ventas-tbody');
  if (!ventas.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2.5rem">
      Sin ventas para este período.</td></tr>`;
    return;
  }
  tbody.innerHTML = ventas.map(v => `<tr>
    <td>${fmtFecha(v.fecha)}</td>
    <td><strong>${v.auto_desc}</strong></td>
    <td>${v.comprador || '—'}</td>
    <td><strong style="color:var(--green)">${fmt(v.precio)}</strong></td>
    <td>${v.notas || '—'}</td>
    <td>
      <button class="btn-eliminar" onclick="editarVenta(${v.id})" title="Editar" style="color:var(--blue);opacity:.7">✏️</button>
      <button class="btn-eliminar" onclick="eliminarVenta(${v.id})" title="Eliminar">✕</button>
    </td>
  </tr>`).join('');
}

function abrirNuevaVenta() {
  document.getElementById('modal-venta-titulo').textContent = 'Nueva venta';
  document.getElementById('v-id').value        = '';
  document.getElementById('v-auto').value      = '';
  document.getElementById('v-precio').value    = '';
  document.getElementById('v-comprador').value = '';
  document.getElementById('v-notas').value     = '';
  document.getElementById('v-fecha').value     = new Date().toISOString().split('T')[0];
  abrirModal('modal-venta');
  setTimeout(() => document.getElementById('v-auto').focus(), 100);
}

async function editarVenta(id) {
  const ventas = await api('/api/ventas');
  const v = ventas.find(x => x.id === id);
  if (!v) return;
  document.getElementById('modal-venta-titulo').textContent = 'Editar venta';
  document.getElementById('v-id').value        = v.id;
  document.getElementById('v-auto').value      = v.auto_desc;
  document.getElementById('v-precio').value    = v.precio;
  document.getElementById('v-comprador').value = v.comprador || '';
  document.getElementById('v-notas').value     = v.notas || '';
  document.getElementById('v-fecha').value     = v.fecha;
  abrirModal('modal-venta');
}

async function guardarVenta() {
  const id      = document.getElementById('v-id').value;
  const auto    = document.getElementById('v-auto').value.trim();
  const precio  = getNumVal('v-precio');
  const fecha   = document.getElementById('v-fecha').value;
  const comprador = document.getElementById('v-comprador').value.trim();
  const notas   = document.getElementById('v-notas').value.trim();
  if (!auto)              { toast('El vehículo es obligatorio', 'err'); return; }
  if (!precio || precio<=0) { toast('El precio es obligatorio', 'err'); return; }
  try {
    if (id) {
      await api(`/api/ventas/${id}`, { method:'PUT', body: JSON.stringify({ fecha, auto_desc:auto, precio, comprador, notas }) });
      toast('Venta actualizada ✓');
    } else {
      await api('/api/ventas', { method:'POST', body: JSON.stringify({ fecha, auto_desc:auto, precio, comprador, notas }) });
      toast('Venta registrada ✓');
    }
    cerrarModal('modal-venta');
    cargarVentas();
  } catch(e) { toast('Error al guardar', 'err'); }
}

async function eliminarVenta(id) {
  if (!confirm('¿Eliminar esta venta?')) return;
  await api(`/api/ventas/${id}`, { method:'DELETE' });
  toast('Venta eliminada');
  cargarVentas();
}

// ═══ MODAL CLIENTE ════════════════════════════════════════════════
function abrirNuevoCliente() {
  document.getElementById('modal-cliente-titulo').textContent = 'Nuevo cliente';
  document.getElementById('f-id').value = '';
  ['f-nombre','f-telefono','f-dni','f-auto','f-saldo','f-cuota','f-total-cuotas','f-obs']
    .forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-modalidad').value    = 'interes';
  document.getElementById('f-fecha-inicio').value = new Date().toISOString().split('T')[0];
  document.getElementById('grupo-saldo').style.display = 'block';
  cambiarModalidad();
  abrirModal('modal-cliente');
  setTimeout(() => document.getElementById('f-nombre').focus(), 100);
}

function editarClienteActual() {
  if (!_clienteActual) return;
  const c = _clienteActual;
  document.getElementById('modal-cliente-titulo').textContent = 'Editar cliente';
  document.getElementById('f-id').value          = c.id;
  document.getElementById('f-nombre').value      = c.nombre;
  document.getElementById('f-telefono').value    = c.telefono||'';
  document.getElementById('f-dni').value         = c.dni||'';
  document.getElementById('f-auto').value        = c.auto_descripcion||'';
  document.getElementById('f-saldo').value       = c.saldo_inicial;
  document.getElementById('f-modalidad').value   = c.modalidad;
  document.getElementById('f-cuota').value       = c.cuota_fija||'';
  document.getElementById('f-total-cuotas').value= c.total_cuotas||'';
  document.getElementById('f-obs').value         = c.observaciones||'';
  document.getElementById('f-fecha-inicio').value= c.fecha_inicio||'';
  document.getElementById('grupo-saldo').style.display = 'none';
  cambiarModalidad();
  abrirModal('modal-cliente');
}

function cambiarModalidad() {
  const m = document.getElementById('f-modalidad').value;
  document.getElementById('grupo-cuotas').style.display = m === 'cuotas' ? 'block' : 'none';
  // Calcular automáticamente el total al cambiar modalidad
  if (m === 'cuotas') calcularTotalCuotas();
}

// ── NUEVO: calcula el total automáticamente cuando se ingresan cuota y cantidad
function calcularTotalCuotas() {
  const cuota = getNumVal('f-cuota');
  const cant  = parseInt(document.getElementById('f-total-cuotas').value) || 0;
  const totalEl = document.getElementById('f-total-calculado');
  if (totalEl) {
    if (cuota > 0 && cant > 0) {
      const total = cuota * cant;
      totalEl.textContent = `Total financiado: ${fmt(total)}`;
      totalEl.style.display = 'block';
      // Auto-completar el saldo inicial si está vacío
      const saldoEl = document.getElementById('f-saldo');
      if (saldoEl && (!saldoEl.value || saldoEl.value === '0')) {
        saldoEl.value = total.toLocaleString('es-AR').replace(/,/g, '.');
      }
    } else {
      totalEl.style.display = 'none';
    }
  }
}

async function guardarCliente() {
  const id     = document.getElementById('f-id').value;
  const nombre = document.getElementById('f-nombre').value.trim();
  const modalidad = document.getElementById('f-modalidad').value;
  let saldo    = getNumVal('f-saldo');

  if (!nombre) { toast('El nombre es obligatorio', 'err'); return; }

  // Para cuotas fijas: calcular saldo_inicial automáticamente si no está puesto
  if (modalidad === 'cuotas') {
    const cuota = getNumVal('f-cuota');
    const cant  = parseInt(document.getElementById('f-total-cuotas').value) || 0;
    if (cuota > 0 && cant > 0 && (!saldo || saldo <= 0)) {
      saldo = cuota * cant;
    }
  }

  if (!id && (!saldo||saldo<=0)) { toast('El saldo a financiar es obligatorio', 'err'); return; }
  const body = {
    nombre,
    telefono:        document.getElementById('f-telefono').value.trim(),
    dni:             document.getElementById('f-dni').value.trim(),
    auto_descripcion:document.getElementById('f-auto').value.trim(),
    saldo_inicial:   saldo,
    modalidad,
    cuota_fija:      getNumVal('f-cuota'),
    total_cuotas:    parseInt(document.getElementById('f-total-cuotas').value)||0,
    observaciones:   document.getElementById('f-obs').value.trim(),
    fecha_inicio:    document.getElementById('f-fecha-inicio').value,
  };
  try {
    if (id) {
      body.estado = _clienteActual?.estado || 'activo';
      await api(`/api/clientes/${id}`, { method:'PUT', body:JSON.stringify(body) });
      toast('Cliente actualizado ✓');
    } else {
      const r = await api('/api/clientes', { method:'POST', body:JSON.stringify(body) });
      if (r.error) { toast(r.error,'err'); return; }
      toast('Cliente creado ✓');
    }
    cerrarModal('modal-cliente');
    id && _clienteActual ? await abrirCuenta(parseInt(id)) : cargarListaClientes();
  } catch(e) { toast('Error al guardar','err'); }
}

// ═══ EXPORTAR XLS ════════════════════════════════════════════════
function exportarXLS() {
  if (!_clienteActual) return;
  window.open(`/api/exportar/${_clienteActual.id}`, '_blank');
}
function exportarXLSTodo() {
  window.open('/api/exportar', '_blank');
}

// ═══ CALCULADORA ══════════════════════════════════════════════════
function calcularCuotas() {
  const monto = getNumVal('calc-monto');
  const tasa  = parseFloat(document.getElementById('calc-tasa')?.value)||6;
  const tbody = document.getElementById('calc-tbody');
  if (!tbody) return;
  if (!monto) { tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:1.5rem">Ingresá un monto</td></tr>`; return; }
  const r = tasa/100;
  tbody.innerHTML = [3,6,12,18,24,36,48].map(n => {
    const interesMes   = Math.round(monto * r);
    const interesTotal = interesMes * n;
    const cuota        = Math.round((monto + interesTotal) / n);
    const costo        = Math.round(tasa * n);
    return `<tr>
      <td><strong>${n}m</strong></td>
      <td>${fmt(interesMes)}</td>
      <td><span class="badge badge-orange">${costo}%</span></td>
      <td><strong style="color:var(--rojo);font-size:.95rem">${fmt(cuota)}</strong></td>
    </tr>`;
  }).join('');
}

// ═══ MODALES ══════════════════════════════════════════════════════
function abrirModal(id)  { document.getElementById(id).classList.add('open'); }
function cerrarModal(id) { document.getElementById(id).classList.remove('open'); }