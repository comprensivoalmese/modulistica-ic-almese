// Crea il PDF compilato e firmato a partire dal modello, e legge i dati dai PDF ricevuti (archivio).
// Funziona nel browser e in Node (test): riceve PDFLib come parametro.
//
// job = {
//   text:   { campo: 'valore' }          campi di testo e tendine
//   check:  [ 'campo', ... ]             caselle da spuntare
//   sigs:   [ { png, p, r:[x0,y0,x1,y1], also:[[p, r], ...] } ]   coordinate dall'alto, in punti
//   hide:   [ [p, [x0,y0,x1,y1]], ... ]  zone da coprire (varianti non scelte, diciture non più vere)
//   meta:   { ... }                      dati per l'archivio, salvati nel PDF
//   title, keywords
// }
async function makePdf(PDFLib, templateBytes, job) {
  const { PDFDocument, StandardFonts, PDFName, PDFHexString, PDFRef, rgb } = PDFLib;
  const pdf = await PDFDocument.load(templateBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const form = pdf.getForm();

  const safe = (s, keepLines) => {
    let out = '';
    const src = keepLines ? String(s).replace(/[ \t]+/g, ' ').replace(/\r/g, '') : String(s).replace(/\s+/g, ' ');
    for (const ch of src.trim()) {
      if (ch === '\n') { out += ch; continue; }
      try { font.encodeText(ch); out += ch; } catch (e) {
        const plain = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
        try { font.encodeText(plain); out += plain; } catch (e2) { /* simboli non stampabili: omessi */ }
      }
    }
    return out;
  };
  const wrap = (text, size, width) => {
    const lines = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const t = line ? line + ' ' + word : word;
        if (line && font.widthOfTextAtSize(t, size) > width) { lines.push(line); line = word; } else line = t;
      }
      lines.push(line);
    }
    return lines;
  };
  const fillText = (name, raw) => {
    let tf;
    try { tf = form.getTextField(name); } catch (e) { return false; }
    const multi = tf.isMultiline();
    let v = safe(raw, multi);
    if (!v) return true;
    const max = tf.getMaxLength();
    if (max) v = v.slice(0, max);
    const rect = tf.acroField.getWidgets()[0].getRectangle();
    const w = rect.width - 4, h = rect.height - 2;
    let size = multi ? 10 : Math.min(10, Math.max(6, rect.height * 0.82));
    if (multi) { while (size > 5 && wrap(v, size, w).length * size * 1.18 > h) size -= 0.5; } else {
      while (size > 5 && font.widthOfTextAtSize(v, size) > w) size -= 0.5;
    }
    if (!tf.acroField.getDefaultAppearance()) tf.acroField.setDefaultAppearance('/Helv 10 Tf 0 0 0.55 rg');
    tf.setText(v);
    tf.setFontSize(size);
    return true;
  };

  for (const [name, raw] of Object.entries(job.text || {})) {
    if (raw === '' || raw == null) continue;
    if (fillText(name, raw)) continue;
    try {  // tendina del modello originale
      const dd = form.getDropdown(name);
      const val = safe(raw);
      if (!dd.getOptions().includes(val)) dd.addOptions([val]);
      dd.select(val);
      dd.setFontSize(10);
    } catch (e) { /* campo inesistente: ignorato */ }
  }
  for (const name of job.check || []) { try { form.getCheckBox(name).check(); } catch (e) { /* */ } }
  form.updateFieldAppearances(font);
  form.flatten();
  // alcuni modelli lasciano nella pagina riferimenti ai campi appena tolti: si ripuliscono
  for (const page of pdf.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = annots.size() - 1; i >= 0; i--) {
      const ref = annots.get(i);
      if (ref instanceof PDFRef && !pdf.context.lookup(ref)) annots.remove(i);
    }
  }

  const H = (pg) => pdf.getPage(pg).getHeight();
  for (const [pg, r] of job.hide || []) {
    const [x0, y0, x1, y1] = r;
    pdf.getPage(pg).drawRectangle({ x: x0, y: H(pg) - y1, width: x1 - x0, height: y1 - y0, color: rgb(1, 1, 1) });
  }
  for (const s of job.sigs || []) {
    if (!s.png) continue;
    const img = await pdf.embedPng(s.png);
    for (const [pg, r] of [[s.p, s.r], ...(s.also || [])]) {
      const page = pdf.getPage(pg);
      const [x0, y0, x1, y1] = r;
      const bw = x1 - x0, bh = y1 - y0 - 3;
      const k = Math.min(bw / img.width, bh / img.height);
      const w = img.width * k, h = img.height * k;
      page.drawImage(img, { x: x0 + (bw - w) / 2, y: H(pg) - y1 + 3, width: w, height: h });
    }
  }
  if (job.keep && job.keep.length) {  // solo le pagine della scelta fatta (es. "compilare la scheda dell'attività e cancellare il resto")
    for (let i = pdf.getPageCount() - 1; i >= 0; i--) if (!job.keep.includes(i)) pdf.removePage(i);
  }
  pdf.setTitle(job.title || '');
  pdf.setAuthor('');
  pdf.setProducer('');
  pdf.setCreator('Modulistica IC Almese');
  if (job.keywords) pdf.setKeywords([].concat(job.keywords));
  if (job.meta) {
    const info = pdf.getInfoDict();
    info.set(PDFName.of(job.metaKey || 'ICAlmeseModulo'), PDFHexString.fromText(JSON.stringify(job.meta)));
  }
  // senza object streams: i dati per l’archivio restano leggibili anche dallo script che salva gli allegati su Drive
  return pdf.save({ updateFieldAppearances: false, useObjectStreams: false });
}

// Dati per l'archivio salvati nel PDF da makePdf; null se il PDF non viene da questa pagina.
async function readMeta(PDFLib, bytes, key) {
  const { PDFDocument, PDFName } = PDFLib;
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  const v = pdf.getInfoDict().lookup(PDFName.of(key || 'ICAlmeseModulo'));
  if (!v || !v.decodeText) return null;
  try { return JSON.parse(v.decodeText()); } catch (e) { return null; }
}

if (typeof module !== 'undefined') module.exports = { makePdf, readMeta };
