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
let _guardando = false; // ← protección anti-doble-click global

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

// ── Toast mejorado: más grande, más tiempo, con ícono
function toast(msg, tipo='ok') {
  const t = document.getElementById('toast');
  const icono = tipo === 'err' ? '❌ ' : tipo === 'warn' ? '⚠️ ' : '✅ ';
  t.innerHTML = icono + msg;
  t.className = `toast ${tipo} show`;
  // Errores duran más para que el usuario los vea
  const duracion = tipo === 'err' ? 5000 : 4000;
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => t.classList.remove('show'), duracion);
}

function emptyState(msg) {
  return `<div class="empty-state">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/>
    </svg><p>${msg}</p></div>`;
}

// ── Botón con spinner mientras guarda
function setBtnGuardando(btnId, guardando, textoOriginal) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = guardando;
  btn.innerHTML = guardando
    ? `<span style="display:inline-flex;align-items:center;gap:.4rem">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
          style="animation:spin .7s linear infinite">
          <circle cx="12" cy="12" r="10" stroke-opacity=".25"/>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
        </svg>Guardando…
      </span>`
    : textoOriginal;
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

  const movs = await api(`/api/movimientos/${id}`);
  const cuotasPagadas = movs.filter(m => m.abono === 1).length;

  const saldoAFinanciar = cliente.saldo_inicial;
  const cuotasLabel     = `Cuota ${cuotasPagadas} de ${cliente.total_cuotas}`;
  const modalLabel      = esCuotas
    ? `${cliente.total_cuotas} cuotas de ${fmt(cliente.cuota_fija)}`
    : `Interés ${cliente.tasa_mensual}% mensual`;

  let resumenHTML = '';

  if (esCuotas) {
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

  let contadorCuotas = 0;
  const totalCuotas = cliente ? (cliente.total_cuotas || 0) : 0;

  tbody.innerHTML = movs.map(m => {
    const esAbono   = m.abono === 1;
    if (esAbono) contadorCuotas++;

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
      ? `<div style="display:flex;gap:.3rem;align-items:center">
           <button class="btn-recibo" onclick="abrirModalRecibo(${m.id})" title="Recibo automático">📄 #${m.numero_recibo}</button>
           <button class="btn-recibo" onclick="abrirReciboManual(${m.id})" title="Crear recibo manual" style="background:var(--orange-bg);color:var(--orange);border-color:rgba(217,119,6,.2)">✏️</button>
         </div>`
      : `<button class="btn-recibo" onclick="abrirReciboManual(null)" style="background:var(--orange-bg);color:var(--orange);border-color:rgba(217,119,6,.2);opacity:.6" title="Crear recibo manual">✏️ Manual</button>`;
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

// ═══ RECIBO MANUAL ════════════════════════════════════════════════
function abrirReciboManual(movId) {
  const c = _clienteActual;
  const hoy = new Date();
  const fechaHoy = `${String(hoy.getDate()).padStart(2,'0')}/${String(hoy.getMonth()+1).padStart(2,'0')}/${hoy.getFullYear()}`;

  document.getElementById('rm-cliente').value   = c ? c.nombre : '';
  document.getElementById('rm-vehiculo').value  = c ? (c.auto_descripcion || '') : '';
  document.getElementById('rm-fecha').value     = fechaHoy;
  document.getElementById('rm-concepto').value  = '';
  document.getElementById('rm-monto').value     = '';
  document.getElementById('rm-saldo').value     = '';
  document.getElementById('rm-notas').value     = '';
  document.getElementById('rm-numero').value    = '';
  abrirModal('modal-recibo-manual');
}

function generarReciboManualPDF() {
  const params = new URLSearchParams({
    cliente:  document.getElementById('rm-cliente').value.trim(),
    vehiculo: document.getElementById('rm-vehiculo').value.trim(),
    fecha:    document.getElementById('rm-fecha').value.trim(),
    concepto: document.getElementById('rm-concepto').value.trim(),
    monto:    document.getElementById('rm-monto').value.replace(/\./g,'').replace(',','.'),
    saldo:    document.getElementById('rm-saldo').value.replace(/\./g,'').replace(',','.'),
    notas:    document.getElementById('rm-notas').value.trim(),
    numero:   document.getElementById('rm-numero').value.trim(),
  });
  const numero = document.getElementById('rm-numero').value.trim() || 'manual';
  _descargarReciboPDF(`/api/recibo-manual?${params.toString()}`, `recibo-${numero}.pdf`);
  cerrarModal('modal-recibo-manual');
}

// Descarga un PDF desde una URL — funciona en celular y desktop
async function _descargarReciboPDF(url, filename) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Error al generar el PDF');
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    a.target = '_blank';        // fallback: abre en nueva pestaña si no descarga
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(blobUrl); }, 1000);
  } catch(e) {
    toast('Error al generar el PDF', 'err');
  }
}

// ═══ MODAL RECIBO ═════════════════════════════════════════════════
async function abrirModalRecibo(movId) {
  _reciboMovId = movId;
  const movs = await api(`/api/movimientos/${_clienteActual.id}`);
  const mov  = movs.find(m => m.id === movId);
  if (!mov) return;

  const esCuotas = _clienteActual.modalidad === 'cuotas';
  const cuotasPagadas = esCuotas ? movs.filter(m => m.abono === 1 && m.id <= movId).length : null;

  document.getElementById('recibo-info').innerHTML = `
    <div><div class="pi-lbl">Cliente</div><div class="pi-val">${_clienteActual.nombre}</div></div>
    <div><div class="pi-lbl">N° Recibo</div><div class="pi-val">#${mov.numero_recibo}</div></div>
    <div><div class="pi-lbl">Fecha</div><div class="pi-val">${fmtFecha(mov.fecha)}</div></div>
    <div><div class="pi-lbl">Monto abonado</div><div class="pi-val verde">${fmt(mov.pago)}</div></div>
    ${esCuotas ? `<div><div class="pi-lbl">Cuota</div><div class="pi-val">${cuotasPagadas} de ${_clienteActual.total_cuotas}</div></div>` : ''}
    <div><div class="pi-lbl">Saldo restante</div><div class="pi-val ${mov.saldo_nuevo > 0 ? 'rojo' : 'verde'}">${fmt(mov.saldo_nuevo)}</div></div>
  `;

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

  document.getElementById('recibo-fecha').value = fmtFecha(mov.fecha);
  abrirModal('modal-recibo');
}

function generarReciboPDF() {
  const concepto = encodeURIComponent(document.getElementById('recibo-concepto').value.trim());
  const fecha    = encodeURIComponent(document.getElementById('recibo-fecha').value.trim());
  _descargarReciboPDF(`/api/recibo/${_reciboMovId}?concepto=${concepto}&fecha=${fecha}`, `recibo-${_reciboMovId}.pdf`);
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

  if (esCuotas && c.cuota_fija) {
    document.getElementById('m-pago').value = c.cuota_fija.toLocaleString('es-AR').replace(/,/g, '.');
  } else {
    document.getElementById('m-pago').value = '';
  }

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

  // Resetear botón por si quedó en estado "guardando" de una operación anterior
  _guardando = false;
  setBtnGuardando('btn-confirmar-movimiento', false, 'Guardar movimiento');

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

// ── CONFIRMAR MOVIMIENTO con protección anti-doble-click ──────────
async function confirmarMovimiento() {
  if (!_clienteActual) return;

  // Bloquear si ya está guardando
  if (_guardando) return;

  const fecha  = document.getElementById('m-fecha').value;
  const estado = document.getElementById('m-estado').value;
  const pago   = getNumVal('m-pago');
  const notas  = document.getElementById('m-notas').value.trim();

  if (!fecha) { toast('La fecha es obligatoria', 'err'); return; }
  if (estado === 'abono' && pago <= 0) { toast('Ingresá el monto abonado', 'err'); return; }

  // Activar modo guardando
  _guardando = true;
  setBtnGuardando('btn-confirmar-movimiento', true, 'Guardar movimiento');

  try {
    const r = await api(`/api/movimientos/${_clienteActual.id}`, {
      method: 'POST', body: JSON.stringify({ fecha, abono: estado === 'abono', pago, notas })
    });

    if (r.error) {
      toast(r.error, 'err');
      _guardando = false;
      setBtnGuardando('btn-confirmar-movimiento', false, 'Guardar movimiento');
      return;
    }

    // Éxito — cerrar modal y mostrar confirmación clara
    cerrarModal('modal-movimiento');
    const msgExito = estado === 'abono'
      ? `Pago de ${fmt(pago)} guardado — Recibo #${r.numero_recibo}`
      : 'Movimiento registrado correctamente';
    toast(msgExito, 'ok');
    await abrirCuenta(_clienteActual.id);

  } catch(e) {
    toast('Error de conexión — intentá de nuevo', 'err');
  } finally {
    _guardando = false;
    setBtnGuardando('btn-confirmar-movimiento', false, 'Guardar movimiento');
  }
}

async function eliminarMovimiento(id) {
  if (!confirm('¿Eliminar este movimiento? Esta acción no se puede deshacer.')) return;
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
  if (m === 'cuotas') calcularTotalCuotas();
}

function calcularTotalCuotas() {
  const cuota = getNumVal('f-cuota');
  const cant  = parseInt(document.getElementById('f-total-cuotas').value) || 0;
  const totalEl = document.getElementById('f-total-calculado');
  if (totalEl) {
    if (cuota > 0 && cant > 0) {
      const total = cuota * cant;
      totalEl.textContent = `Total financiado: ${fmt(total)}`;
      totalEl.style.display = 'block';
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
// PDF completo con todos los movimientos — respaldo imprimible
function exportarPDF() {
  if (!_clienteActual) return;
  window.open(`/api/exportar/${_clienteActual.id}/pdf`, '_blank');
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

function cerrarModal(id) {
  // Si se intenta cerrar el modal de movimiento mientras está guardando, bloquearlo
  if (id === 'modal-movimiento' && _guardando) return;
  document.getElementById(id).classList.remove('open');
}

// ═══ MENÚ EXPORTAR ════════════════════════════════════════════════
function toggleMenuExportar() {
  const m = document.getElementById('menu-exportar');
  m.style.display = m.style.display === 'none' ? 'block' : 'none';
}
function cerrarMenuExportar() {
  const m = document.getElementById('menu-exportar');
  if (m) m.style.display = 'none';
}
// Cerrar menú si se hace click afuera
document.addEventListener('click', e => {
  const wrap = document.getElementById('menu-exportar-wrap');
  if (wrap && !wrap.contains(e.target)) cerrarMenuExportar();
});

// ═══ IMPORTAR MOVIMIENTOS ══════════════════════════════════════════
let _movimientosAImportar = [];

function abrirImportarMovimientos() {
  if (!_clienteActual) return;
  _movimientosAImportar = [];
  document.getElementById('imp-archivo').value = '';
  document.getElementById('imp-preview').style.display = 'none';
  document.getElementById('btn-confirmar-importar').style.display = 'none';
  abrirModal('modal-importar');
}

function descargarPlantilla() {
  // Generar plantilla de ejemplo como CSV descargable
  const csv = 'fecha,pago,notas\n' +
    '01/03/2026,143000,Pagó en efectivo\n' +
    '05/04/2026,143000,Transfirió\n' +
    '02/05/2026,143000,';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'plantilla-movimientos.csv';
  a.click(); URL.revokeObjectURL(url);
}

function previsualizarImportacion() {
  const file = document.getElementById('imp-archivo').files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      let filas = [];

      if (file.name.endsWith('.csv')) {
        // Parsear CSV manualmente
        const text = new TextDecoder('utf-8').decode(new Uint8Array(e.target.result));
        const lines = text.trim().split('\n').slice(1); // saltar encabezado
        filas = lines.map(l => {
          const [fecha, pago, ...resto] = l.split(',');
          return { fecha: (fecha||'').trim(), pago: (pago||'').trim(), notas: resto.join(',').trim() };
        });
      } else {
        // Parsear XLSX con SheetJS
        const wb   = XLSX.read(e.target.result, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const rows = data.slice(1); // saltar encabezado
        filas = rows.map(r => ({
          fecha: String(r[0] || '').trim(),
          pago:  String(r[1] || '').trim(),
          notas: String(r[2] || '').trim(),
        }));
      }

      // Validar y parsear cada fila
      _movimientosAImportar = [];
      const errores = [];

      filas.forEach((f, i) => {
        if (!f.fecha && !f.pago) return; // fila vacía, ignorar

        // Parsear fecha — acepta DD/MM/AAAA o AAAA-MM-DD
        let fechaISO = '';
        const matchDMY = f.fecha.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        const matchYMD = f.fecha.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (matchDMY) {
          fechaISO = `${matchDMY[3]}-${matchDMY[2].padStart(2,'0')}-${matchDMY[1].padStart(2,'0')}`;
        } else if (matchYMD) {
          fechaISO = f.fecha;
        } else {
          errores.push(`Fila ${i+2}: fecha inválida "${f.fecha}" (usá DD/MM/AAAA)`);
          return;
        }

        // Parsear monto
        const monto = parseFloat(String(f.pago).replace(/\./g,'').replace(',','.'));
        if (!monto || monto <= 0) {
          errores.push(`Fila ${i+2}: monto inválido "${f.pago}"`);
          return;
        }

        _movimientosAImportar.push({ fecha: fechaISO, pago: monto, notas: f.notas || '' });
      });

      // Mostrar preview
      const tbody = document.getElementById('imp-tbody');
      tbody.innerHTML = _movimientosAImportar.map((m, i) => `<tr>
        <td>${i+1}</td>
        <td>${fmtFecha(m.fecha)}</td>
        <td><span class="monto-verde">${fmt(m.pago)}</span></td>
        <td style="color:var(--text-muted);font-size:.78rem">${m.notas || '—'}</td>
        <td><span style="color:#16a34a;font-size:.78rem">✓ OK</span></td>
      </tr>`).join('');

      const errDiv = document.getElementById('imp-errores');
      if (errores.length) {
        errDiv.style.display = 'block';
        errDiv.innerHTML = '<strong>⚠ Filas con error (se van a omitir):</strong><br>' + errores.join('<br>');
      } else {
        errDiv.style.display = 'none';
      }

      document.getElementById('imp-cant').textContent = _movimientosAImportar.length;
      document.getElementById('imp-cant-btn').textContent = _movimientosAImportar.length;
      document.getElementById('imp-preview').style.display = 'block';

      const btnOk = document.getElementById('btn-confirmar-importar');
      btnOk.style.display = _movimientosAImportar.length > 0 ? 'inline-flex' : 'none';

    } catch(err) {
      toast('Error al leer el archivo: ' + err.message, 'err');
    }
  };
  reader.readAsArrayBuffer(file);
}

async function confirmarImportacion() {
  if (!_clienteActual || !_movimientosAImportar.length) return;

  const btn = document.getElementById('btn-confirmar-importar');
  btn.disabled = true;
  btn.innerHTML = '⏳ Importando...';

  let ok = 0, errores = 0;

  for (const m of _movimientosAImportar) {
    try {
      const r = await api(`/api/movimientos/${_clienteActual.id}`, {
        method: 'POST',
        body: JSON.stringify({ fecha: m.fecha, abono: true, pago: m.pago, notas: m.notas })
      });
      if (r.error) { errores++; } else { ok++; }
    } catch(e) { errores++; }
  }

  cerrarModal('modal-importar');

  if (errores === 0) {
    toast(`${ok} movimientos importados correctamente ✓`, 'ok');
  } else {
    toast(`Importados: ${ok} ✓  |  Errores: ${errores} ✗`, 'warn');
  }

  await abrirCuenta(_clienteActual.id);
}