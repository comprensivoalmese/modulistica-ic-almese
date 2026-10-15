// Documenti composti (verbali): si riusa l'intestazione del modello (tabella con codice e logo) e si scrive il testo per intero.
// spec = { head1: {p, clip:[x0,y0,x1,y1]}, head2: {...} | null, top1, top2, L, R, B, blocks: [...], meta, metaKey, title }
// blocchi: {t:'h', text} {t:'sub', text} {t:'p', r: runs, size, indent, gap, align} {t:'li', items: [runs], num}
//          {t:'space', h} {t:'table', cols: [{l, w}], rows: [[testo]]} {t:'sig', items: [{l, name, png, digital}], cols}
// runs: stringa oppure [[testo, 'r' | 'b' | 'i'], ...]
async function composePdf(PDFLib, templateBytes, spec) {
  const { PDFDocument, StandardFonts, PDFName, PDFHexString, rgb } = PDFLib;
  const src = await PDFDocument.load(templateBytes);
  const pdf = await PDFDocument.create();
  const F = {
    r: await pdf.embedFont(StandardFonts.Helvetica),
    b: await pdf.embedFont(StandardFonts.HelveticaBold),
    i: await pdf.embedFont(StandardFonts.HelveticaOblique),
  };
  const sp = src.getPage(spec.head1.p || 0);
  const W = sp.getWidth(), H = sp.getHeight();
  const L = spec.L ?? 57, R = W - (spec.R ?? 57), B = spec.B ?? 60;
  const emb = async (h) => (h ? { h, e: await pdf.embedPage(src.getPage(h.p || 0), { left: h.clip[0], right: h.clip[2], bottom: H - h.clip[3], top: H - h.clip[1] }) } : null);
  const h1 = await emb(spec.head1), h2 = await emb(spec.head2);
  const safe = (s) => {
    let o = '';
    for (const ch of String(s ?? '').replace(/[\t\r]/g, ' ')) {
      if (ch === '\n') { o += ch; continue; }
      try { F.r.encodeText(ch); o += ch; } catch (e) {
        const p = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
        try { F.r.encodeText(p); o += p; } catch (e2) { /* simboli non stampabili */ }
      }
    }
    return o;
  };
  const pages = [];
  let page, y;
  const newPage = () => {
    page = pdf.addPage([W, H]);
    const hh = pages.length ? h2 : h1;
    pages.push(page);
    if (hh) page.drawPage(hh.e, { x: hh.h.clip[0], y: H - hh.h.clip[3], width: hh.h.clip[2] - hh.h.clip[0], height: hh.h.clip[3] - hh.h.clip[1] });
    y = pages.length === 1 ? spec.top1 : (spec.top2 ?? 60);
  };
  newPage();
  const ensure = (h) => { if (y + h > H - B) newPage(); };
  const runsOf = (r) => (typeof r === 'string' ? [[r, 'r']] : r).map((x) => (typeof x === 'string' ? [safe(x), 'r'] : [safe(x[0]), x[1] || 'r']));
  const width = (t, st, size) => F[st].widthOfTextAtSize(t, size);
  const layout = (runs, size, w) => {  // righe: [[testo, stile, larghezza], ...]
    const lines = [[]];
    let lw = 0;
    for (const [text, st] of runs) {
      for (const part of text.split(/(\n| )/)) {
        if (part === '') continue;
        if (part === '\n') { lines.push([]); lw = 0; continue; }
        const pw = width(part, st, size);
        if (part === ' ') { if (lw > 0) { lines[lines.length - 1].push([' ', st, pw]); lw += pw; } continue; }
        if (lw + pw > w && lw > 0) {
          const ln = lines[lines.length - 1];
          while (ln.length && ln[ln.length - 1][0] === ' ') ln.pop();
          lines.push([]); lw = 0;
        }
        let word = part;
        while (width(word, st, size) > w && word.length > 2) {  // parola più lunga della riga
          let k = word.length - 1;
          while (k > 1 && width(word.slice(0, k), st, size) > w) k--;
          lines[lines.length - 1].push([word.slice(0, k), st, width(word.slice(0, k), st, size)]);
          lines.push([]); word = word.slice(k);
        }
        const ww = width(word, st, size);
        lines[lines.length - 1].push([word, st, ww]); lw += ww;
      }
    }
    return lines;
  };
  const drawLines = (lines, x, size, w, align, lh) => {
    for (const ln of lines) {
      ensure(lh);
      const tw = ln.reduce((a, s) => a + s[2], 0);
      let cx = align === 'center' ? x + (w - tw) / 2 : align === 'right' ? x + w - tw : x;
      for (const [t, st, ww] of ln) {
        if (t !== ' ') page.drawText(t, { x: cx, y: H - y - size, size, font: F[st], color: rgb(0, 0, 0) });
        cx += ww;
      }
      y += lh;
    }
  };
  const para = (runs, o = {}) => {
    const size = o.size || 10.5, lh = size * (o.lh || 1.4);
    const x = L + (o.indent || 0), w = R - x;
    if (o.bullet) { ensure(lh); page.drawText(safe(o.bullet), { x: x - (o.bw || 12), y: H - y - size, size, font: F.r }); }
    drawLines(layout(runsOf(runs), size, w), x, size, w, o.align, lh);
    y += o.gap ?? 4;
  };
  for (const b of spec.blocks) {
    if (b.t === 'space') { y += b.h || 8; continue; }
    if (b.t === 'h') { y += b.before ?? 6; ensure(34); para([[b.text, 'b']], { size: b.size || 12.5, align: b.align || 'center', gap: b.gap ?? 8 }); continue; }
    if (b.t === 'sub') { y += 6; ensure(44); para([[b.text, 'b']], { size: 10.5, gap: 3 }); continue; }
    if (b.t === 'p') { para(b.r, b); continue; }
    if (b.t === 'li') {
      b.items.forEach((it, i) => para(it, { indent: (b.indent || 0) + 16, bullet: b.num ? `${i + 1}.` : '-', bw: 14, gap: 2, size: b.size }));
      y += 4;
      continue;
    }
    if (b.t === 'table') {
      const size = b.size || 9.5, lh = size * 1.3, pad = 3;
      const ws = b.cols.map((c) => c.w * (R - L));
      const cellLines = (c, i, st) => layout(runsOf([[String(c ?? ''), st]]), size, ws[i] - 2 * pad);
      const drawRow = (cells, st, head) => {
        const h = Math.max(1, ...cells.map((c, i) => cellLines(c, i, st).length)) * lh + 2 * pad;
        if (y + h > H - B) { newPage(); if (!head) drawRow(b.cols.map((c) => c.l), 'b', true); }
        let x = L;
        const y0 = y;
        cells.forEach((c, i) => {
          if (head) page.drawRectangle({ x, y: H - y0 - h, width: ws[i], height: h, color: rgb(0.93, 0.93, 0.93) });
          page.drawRectangle({ x, y: H - y0 - h, width: ws[i], height: h, borderColor: rgb(0.35, 0.35, 0.35), borderWidth: 0.6 });
          y = y0 + pad;
          drawLines(cellLines(c, i, st), x + pad, size, ws[i] - 2 * pad, 'left', lh);
          x += ws[i];
        });
        y = y0 + h;
      };
      ensure(lh * 3 + 12);
      drawRow(b.cols.map((c) => c.l), 'b', true);
      for (const r of b.rows) drawRow(r, 'r', false);
      y += 8;
      continue;
    }
    if (b.t === 'sig') {
      const n = b.items.length;
      const cols = b.cols || Math.min(2, n) || 1;
      const single = cols === 1 && b.right !== false;
      const cw = (R - L) / cols, bh = 66;
      for (let i = 0; i < n; i += cols) {
        ensure(bh + 6);
        const row = b.items.slice(i, i + cols);
        for (let j = 0; j < row.length; j++) {
          const it = row[j];
          const x = single ? R - 220 : L + j * cw, w = single ? 220 : cw - 10;
          const tx = (t, yy, size, st) => { const s = safe(t); page.drawText(s, { x: x + (w - width(s, st, size)) / 2, y: H - yy - size, size, font: F[st] }); };
          tx(it.l || '', y, 9.5, 'r');
          if (it.name) tx(it.name, y + 12, 10, 'r');
          const top = y + (it.name ? 26 : 14);
          if (it.png) {
            const img = await pdf.embedPng(it.png);
            const k = Math.min((w - 20) / img.width, 34 / img.height);
            page.drawImage(img, { x: x + (w - img.width * k) / 2, y: H - top - img.height * k, width: img.width * k, height: img.height * k });
          } else if (it.digital) tx('documento firmato digitalmente ai sensi del D.Lgs. n. 82/2005 s.m.i. e norme collegate', top + 4, 6.5, 'r');
          else page.drawLine({ start: { x: x + 15, y: H - top - 32 }, end: { x: x + w - 15, y: H - top - 32 }, thickness: 0.5, color: rgb(0.3, 0.3, 0.3) });
        }
        y += bh;
      }
    }
  }
  pages.forEach((p, i) => {
    const t = `pag. ${i + 1} di ${pages.length}`;
    p.drawText(t, { x: R - width(t, 'r', 8), y: 28, size: 8, font: F.r, color: rgb(0.3, 0.3, 0.3) });
  });
  pdf.setTitle(spec.title || '');
  pdf.setProducer('');
  pdf.setCreator('Modulistica IC Almese');
  if (spec.keywords) pdf.setKeywords([].concat(spec.keywords));
  if (spec.meta) pdf.getInfoDict().set(PDFName.of(spec.metaKey || 'ICAlmeseModulo'), PDFHexString.fromText(JSON.stringify(spec.meta)));
  return pdf.save({ useObjectStreams: false });
}

if (typeof module !== 'undefined') module.exports = { composePdf };
