const express = require('express');
const router  = express.Router();
const db      = require('../db');
const PDFDocument = require('pdfkit');
const path    = require('path');
const fs      = require('fs');

const LOGO    = path.join(__dirname, '../public/img/logo.png');
const ROJO    = '#D92B2B';
const NEGRO   = '#1a1a1a';
const GRIS    = '#666666';
const GRIS2   = '#999999';
const LINEA   = '#e5e5e5';
const VERDE   = '#16a34a';
const AZUL    = '#2563eb';

function fmtM(n) {
  return '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtF(f) {
  if (!f) return '';
  const [y, m, d] = f.split('-');
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${parseInt(d)} de ${meses[parseInt(m)-1]} de ${y}`;
}
function fmtFCorta(f) {
  if (!f) return '';
  const [y, m, d] = f.split('-');
  return `${d}/${m}/${y}`;
}

// ── Helpers para la página de descarga en celular ──────────────────────
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// Reenvía todos los parámetros (menos pdf/dl) al link del PDF
function fwdQS(query) {
  const parts = [];
  Object.keys(query || {}).forEach(k => {
    if (k === 'pdf' || k === 'dl') return;
    if (query[k] != null && query[k] !== '') parts.push(k + '=' + encodeURIComponent(query[k]));
  });
  return parts.length ? '&' + parts.join('&') : '';
}
// Página HTML (mobile) que muestra el recibo y un botón que abre el menú
// nativo Compartir/Guardar del celular. Resuelve la descarga del PDF en el teléfono.
function htmlReciboAuto(d) {
  const fwd     = fwdQS(d.query);
  const linkVer = `${d.pdfPath}?pdf=1${fwd}`;
  const linkDl  = `${d.pdfPath}?pdf=1&dl=1${fwd}`;
  const nombrePdf = `recibo-${d.numeroRecibo || ''}.pdf`;
  const colores = { verde:'#16a34a', rojo:'#D92B2B', azul:'#2563eb', negro:'#1a1a1a' };
  const detalleHtml = (d.detalle || []).map(([l, v, c]) =>
    `<div class="det"><span style="color:#666">${esc(l)}</span><span style="color:${colores[c]||colores.negro};font-weight:700">${esc(v)}</span></div>`
  ).join('<div style="height:6px"></div>');
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Recibo ${esc(d.numeroRecibo ? 'N° ' + d.numeroRecibo : '')}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
       background:#f3f4f6;color:#1a1a1a;padding:16px;padding-bottom:96px;-webkit-text-size-adjust:100%}
  .card{max-width:480px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.10)}
  .head{background:#D92B2B;color:#fff;padding:18px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px}
  .head img{height:46px;background:#fff;border-radius:8px;padding:4px}
  .head .num{font-size:1.4rem;font-weight:800;text-align:right;line-height:1.1}
  .head .num small{display:block;font-size:.72rem;font-weight:500;opacity:.85;letter-spacing:.08em}
  .body{padding:20px}
  .row{display:flex;gap:20px;margin-bottom:16px}.row>div{flex:1}
  .lbl{font-size:.66rem;letter-spacing:.09em;color:#9aa0a6;font-weight:600;margin-bottom:3px}
  .val{font-size:.98rem}.val.b{font-weight:700}.sep{height:1px;background:#ececec;margin:14px 0}
  .suma{background:#fff5f5;border:1px solid #D92B2B;border-radius:10px;padding:16px;text-align:center;margin:6px 0 4px}
  .suma .m{color:#D92B2B;font-size:2rem;font-weight:800}
  .det{display:flex;justify-content:space-between;align-items:center;font-size:.92rem}
  .foot{background:#f5f5f5;text-align:center;color:#9aa0a6;font-size:.72rem;padding:12px}
  .bar{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid #e5e5e5;
       padding:12px 16px;padding-bottom:calc(12px + env(safe-area-inset-bottom));display:flex;gap:10px;max-width:480px;margin:0 auto}
  .btn{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;
       font-size:1rem;font-weight:700;border-radius:10px;padding:14px;border:0;cursor:pointer;font-family:inherit}
  .btn:disabled{opacity:.7}
  .btn-dl{background:#D92B2B;color:#fff}.btn-ver{background:#fff;color:#D92B2B;border:1.5px solid #D92B2B}
  .hint{max-width:480px;margin:10px auto 0;text-align:center;color:#9aa0a6;font-size:.74rem;line-height:1.4}
</style>
</head>
<body>
  <div class="card">
    <div class="head">
      <img src="/img/logo.png" alt="Logo" onerror="this.style.display='none'">
      <div class="num"><small>RECIBO</small>${esc(d.numeroRecibo ? 'N° ' + d.numeroRecibo : '')}</div>
    </div>
    <div class="body">
      <div class="row">
        <div><div class="lbl">FECHA</div><div class="val">${esc(d.fechaManual)}</div></div>
        <div><div class="lbl">CLIENTE</div><div class="val b">${esc(d.clienteNombre)}</div>
          ${d.clienteDni ? `<div style="font-size:.78rem;color:#666;margin-top:2px">DNI: ${esc(d.clienteDni)}</div>` : ''}
        </div>
      </div>
      ${d.vehiculo ? `<div class="sep"></div><div class="lbl">VEHÍCULO</div><div class="val" style="margin-top:2px">${esc(d.vehiculo)}</div>` : ''}
      <div class="sep"></div>
      <div class="lbl">ABONA LA SUMA DE</div>
      <div class="suma"><div class="m">${esc(d.sumaStr)}</div></div>
      ${d.concepto ? `<div class="lbl" style="margin-top:14px">EN CONCEPTO DE</div><div class="val" style="margin-top:2px">${esc(d.concepto)}</div>` : ''}
      <div class="sep"></div>
      <div class="lbl">DETALLE</div>
      <div style="margin-top:8px">${detalleHtml}</div>
      ${d.notas ? `<div style="font-size:.78rem;color:#9aa0a6;margin-top:10px">Notas: ${esc(d.notas)}</div>` : ''}
    </div>
    <div class="foot">Yadon Automotores — Catamarca<br>Fecha: ${esc(d.fechaManual)}</div>
  </div>
  <p class="hint" id="hint">Tocá <b>Descargar recibo</b> y elegí <b>Guardar en Archivos</b> o <b>Guardar imagen</b>.</p>
  <div class="bar">
    <a class="btn btn-ver" href="${linkVer}" target="_blank" rel="noopener">👁️ Ver</a>
    <button class="btn btn-dl" id="btnDl" onclick="descargarRecibo(this)">⬇️ Descargar recibo</button>
  </div>
  <script>
    var PDF_URL  = ${JSON.stringify(linkDl)};
    var PDF_NAME = ${JSON.stringify(nombrePdf)};
    async function descargarRecibo(btn){
      var txt = btn.innerHTML;
      btn.innerHTML = '⏳ Generando…'; btn.disabled = true;
      try{
        var resp = await fetch(PDF_URL);
        if(!resp.ok) throw new Error('HTTP ' + resp.status);
        var blob = await resp.blob();
        var file = new File([blob], PDF_NAME, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try { await navigator.share({ files: [file], title: 'Recibo' }); }
          catch(e){ if (e && e.name === 'AbortError') {} else { throw e; } }
        } else {
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url; a.download = PDF_NAME;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function(){ URL.revokeObjectURL(url); }, 5000);
        }
      } catch(err){
        window.open(PDF_URL, '_blank');
      } finally {
        btn.innerHTML = txt; btn.disabled = false;
      }
    }
  </script>
</body>
</html>`;
}

// GET /api/recibo/:movId?concepto=...  → genera PDF
router.get('/:movId', (req, res) => {
  const mov = db.get('SELECT * FROM movimientos WHERE id=?', [req.params.movId]);
  if (!mov) return res.status(404).json({ error: 'No encontrado' });
  const cliente = db.get('SELECT * FROM clientes WHERE id=?', [mov.cliente_id]);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  const esCuotas = cliente.modalidad === 'cuotas';

  // Cuota número: contar cuántos abonos hubo hasta este movimiento
  let numeroCuota = 0;
  if (esCuotas) {
    const movsPrevios = db.query(
      'SELECT id FROM movimientos WHERE cliente_id=? AND abono=1 AND id<=? ORDER BY id ASC',
      [mov.cliente_id, mov.id]
    );
    numeroCuota = movsPrevios.length;
  }

  // Concepto editable — viene por query param
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const [y, m] = (mov.fecha || '').split('-');
  const mesLabel = m ? `${meses[parseInt(m)-1]} ${y}` : '';

  let conceptoDefault;
  if (esCuotas) {
    conceptoDefault = `Cuota ${numeroCuota} de ${cliente.total_cuotas} — ${cliente.auto_descripcion || ''}`;
  } else {
    conceptoDefault = `Corresponde a cuota del mes de ${mesLabel}`;
  }
  const concepto   = req.query.concepto ? decodeURIComponent(req.query.concepto) : conceptoDefault;
  const fechaManual = req.query.fecha    ? decodeURIComponent(req.query.fecha)    : fmtF(mov.fecha);

  // Si NO se pide el PDF explícito, devolvemos la página con el botón de descarga (para el celular).
  const wantPdf = req.query.pdf === '1' || req.query.pdf === 'true';
  if (!wantPdf) {
    const detalle = [];
    if (esCuotas) {
      detalle.push(['Monto abonado', fmtM(mov.pago), 'verde']);
      detalle.push(['Cuota N°', `${numeroCuota} de ${cliente.total_cuotas}`, 'azul']);
    } else {
      detalle.push(['Monto abonado', fmtM(mov.pago), 'verde']);
      detalle.push(['Saldo restante', fmtM(mov.saldo_nuevo), mov.saldo_nuevo > 0 ? 'rojo' : 'verde']);
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(htmlReciboAuto({
      pdfPath: `/api/recibo/${mov.id}`,
      numeroRecibo: mov.numero_recibo,
      fechaManual, concepto,
      clienteNombre: cliente.nombre,
      clienteDni: cliente.dni,
      vehiculo: cliente.auto_descripcion,
      sumaStr: fmtM(mov.pago),
      detalle, notas: mov.notas,
      query: req.query
    }));
  }
  const forzarDescarga = req.query.dl === '1' || req.query.dl === 'true';

  const doc    = new PDFDocument({ size: 'A5', margin: 0 });
  const W      = doc.page.width;
  const H      = doc.page.height;
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  doc.on('end', () => {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${forzarDescarga ? 'attachment' : 'inline'}; filename="recibo-${mov.numero_recibo}.pdf"`);
    res.send(Buffer.concat(chunks));
  });

  // ── Franja roja superior
  doc.rect(0, 0, W, 70).fill(ROJO);

  // Logo
  if (fs.existsSync(LOGO)) {
    doc.image(LOGO, 18, 8, { height: 52 });
  }

  // RECIBO y número — derecha
  doc.fontSize(9).fillColor('rgba(255,255,255,.7)').font('Helvetica')
     .text('RECIBO', 0, 16, { align: 'right', width: W - 18 });
  doc.fontSize(20).fillColor('white').font('Helvetica-Bold')
     .text(`N° ${mov.numero_recibo}`, 0, 28, { align: 'right', width: W - 18 });

  // ── Cuerpo
  let posY = 85;

  // Fecha + Cliente en la misma zona
  doc.fontSize(8).fillColor(GRIS2).font('Helvetica').text('FECHA', 28, posY);
  doc.fontSize(8).fillColor(GRIS2).font('Helvetica').text('CLIENTE', W/2, posY);
  doc.fontSize(10).fillColor(NEGRO).font('Helvetica').text(fechaManual, 28, posY + 12);
  doc.fontSize(10).fillColor(NEGRO).font('Helvetica-Bold').text(cliente.nombre, W/2, posY + 12, { width: W/2 - 28 });

  if (cliente.dni) {
    doc.fontSize(8).fillColor(GRIS).font('Helvetica').text(`DNI: ${cliente.dni}`, W/2, posY + 26, { width: W/2 - 28 });
  }

  posY += 46;

  // Vehículo (si hay)
  if (cliente.auto_descripcion) {
    doc.moveTo(28, posY).lineTo(W - 28, posY).strokeColor(LINEA).lineWidth(0.5).stroke();
    posY += 10;
    doc.fontSize(8).fillColor(GRIS2).font('Helvetica').text('VEHÍCULO', 28, posY);
    doc.fontSize(10).fillColor(NEGRO).font('Helvetica').text(cliente.auto_descripcion, 28, posY + 12, { width: W - 56 });
    posY += 30;
  }

  // Línea separadora
  doc.moveTo(28, posY).lineTo(W - 28, posY).strokeColor(LINEA).lineWidth(0.5).stroke();
  posY += 12;

  // La suma de
  doc.fontSize(8).fillColor(GRIS2).font('Helvetica').text('ABONA LA SUMA DE', 28, posY);

  // Recuadro monto
  doc.rect(28, posY + 12, W - 56, 44).fill('#fff5f5').stroke(ROJO);
  doc.fontSize(24).fillColor(ROJO).font('Helvetica-Bold')
     .text(fmtM(mov.pago), 28, posY + 20, { align: 'center', width: W - 56 });

  posY += 70;

  // En concepto de
  doc.fontSize(8).fillColor(GRIS2).font('Helvetica').text('EN CONCEPTO DE', 28, posY);
  doc.fontSize(10).fillColor(NEGRO).font('Helvetica').text(concepto, 28, posY + 12, { width: W - 56 });

  posY += 36;

  // Detalle financiero
  doc.moveTo(28, posY).lineTo(W - 28, posY).strokeColor(LINEA).lineWidth(0.5).stroke();
  posY += 10;
  doc.fontSize(8).fillColor(GRIS2).font('Helvetica').text('DETALLE', 28, posY);
  posY += 14;

  function filaDet(label, valor, colorVal = NEGRO) {
    doc.fontSize(9).fillColor(GRIS).font('Helvetica').text(label, 28, posY);
    doc.fontSize(9).fillColor(colorVal).font('Helvetica-Bold')
       .text(valor, 0, posY, { align: 'right', width: W - 28 });
    posY += 15;
  }

  if (esCuotas) {
    filaDet('Monto abonado', fmtM(mov.pago), VERDE);
    filaDet('Cuota N°', `${numeroCuota} de ${cliente.total_cuotas}`, AZUL);
  } else {
    // Para interés mensual: monto abonado y saldo restante
    filaDet('Monto abonado', fmtM(mov.pago), VERDE);
    filaDet('Saldo restante', fmtM(mov.saldo_nuevo), mov.saldo_nuevo > 0 ? ROJO : VERDE);
  }

  if (mov.notas) {
    posY += 4;
    doc.fontSize(8).fillColor(GRIS2).font('Helvetica').text(`Notas: ${mov.notas}`, 28, posY, { width: W - 56 });
    posY += 14;
  }

  // ── Pie
  const yPie = H - 38;
  doc.rect(0, yPie, W, 38).fill('#f5f5f5');
  doc.moveTo(0, yPie).lineTo(W, yPie).strokeColor(LINEA).lineWidth(0.5).stroke();
  doc.fontSize(7.5).fillColor(GRIS2).font('Helvetica')
     .text('Yadon Automotores — Catamarca', 0, yPie + 8, { align: 'center' })
     .text(`Fecha: ${fechaManual}`, 0, yPie + 20, { align: 'center' });

  doc.end();
});

module.exports = router;