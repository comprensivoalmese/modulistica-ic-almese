/* Modulistica IC Almese: catalogo, compilazione con anteprima, firme, invio, archivio dei moduli ricevuti.
   Tutto avviene nel browser. Nessun dato viene salvato o inviato dalla pagina. */
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const pad2 = (n) => String(n).padStart(2, '0');
const isoDay = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const itDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v.split('-').reverse().join('/') : v || '');
const schoolYear = (d) => { const y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1; return `${y}/${y + 1}`; };
const CATS = FORMS.cats;
const ALL = FORMS.forms;
const ORDER = Object.values(ALL);

// ======================================================================== navigazione
const views = { compila: 'v-compila', archivio: 'v-archivio', privacy: 'v-privacy' };
function show(view) {
  for (const [k, id] of Object.entries(views)) {
    $('#' + id).hidden = k !== view;
    $('#t-' + k).setAttribute('aria-selected', String(k === view));
  }
  $('#bar').hidden = !(view === 'compila' && cur);
  window.scrollTo(0, 0);
}
for (const k of Object.keys(views)) $('#t-' + k).addEventListener('click', () => { history.replaceState(null, '', '#' + k); show(k); });

// ======================================================================== catalogo
let cat = '';
function renderCats() {
  const counts = {};
  for (const m of ORDER) counts[m.cat] = (counts[m.cat] || 0) + 1;
  const items = [['', 'Tutti', ORDER.length], ...Object.entries(CATS).filter(([k]) => counts[k]).map(([k, l]) => [k, l, counts[k]])];
  $('#cats').innerHTML = items.map(([k, l, n]) => `<button type="button" class="chip" data-cat="${k}" aria-pressed="${k === cat}">${esc(l)}<span class="n">${n}</span></button>`).join('');
}
function renderList() {
  const q = norm($('#q').value).split(/\s+/).filter(Boolean);
  const list = ORDER.filter((m) => (!cat || m.cat === cat) && q.every((w) => norm(`${m.code} ${m.title} ${m.desc} ${CATS[m.cat]}`).includes(w)));
  $('#count').textContent = `${list.length} modul${list.length === 1 ? 'o' : 'i'}`;
  $('#mods').innerHTML = list.length ? list.map((m) => `<button type="button" class="mod" data-id="${m.id}">
      <span class="row"><span class="code">${esc(m.code)}</span><span class="badge">${esc(CATS[m.cat])}</span></span>
      <span class="name">${esc(m.title)}</span><span class="desc">${esc(m.desc)}</span></button>`).join('')
    : '<div class="empty">Nessun modulo trovato. Prova con un’altra parola.</div>';
}
$('#cats').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (!b) return; cat = b.dataset.cat; renderCats(); renderList(); });
$('#q').addEventListener('input', renderList);
$('#mods').addEventListener('click', (e) => { const b = e.target.closest('.mod'); if (b) openForm(b.dataset.id); });

// ======================================================================== modelli PDF
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const tplCache = {};
async function template(id) {
  if (tplCache[id]) return tplCache[id];
  let bytes;
  if (typeof TPL !== 'undefined' && TPL[id]) bytes = b64(TPL[id]);
  else {
    let r;
    try { r = await fetch(`forms/${id}.pdf`); } catch (e) {
      throw new Error(location.protocol === 'file:' ? 'aperta con doppio clic, la pagina non può leggere i modelli. Aprila dal suo indirizzo internet: '
        + CONFIG.sitoPubblico : 'controlla la connessione a internet e riprova.');
    }
    if (!r.ok) throw new Error('modello non trovato');
    bytes = new Uint8Array(await r.arrayBuffer());
  }
  return (tplCache[id] = bytes);
}
// copia della cartella del sito aperta con doppio clic: i modelli non si possono leggere (il file unico invece li contiene)
if (location.protocol === 'file:' && typeof TPL === 'undefined') {
  $('#fileLocale').hidden = false;
  $('#fileLocale').innerHTML = `Hai aperto la pagina con un doppio clic sul file: così il browser non le permette di leggere i modelli.
    Aprila dal suo indirizzo: <a href="${esc(CONFIG.sitoPubblico)}">${esc(CONFIG.sitoPubblico)}</a>
    (oppure usa il file unico “Modulistica IC Almese.html”).`;
}
function attachUrl(name) {
  if (typeof ATT !== 'undefined' && ATT[name]) return URL.createObjectURL(new Blob([b64(ATT[name])], { type: 'application/pdf' }));
  return 'forms/att/' + encodeURIComponent(name);
}
let pdfjsReady = null;
function pdfjs() {
  if (pdfjsReady) return pdfjsReady;
  const w = $('#pdfworker');
  pdfjsLib.GlobalWorkerOptions.workerSrc = w ? URL.createObjectURL(new Blob([w.textContent], { type: 'text/javascript' })) : 'lib/pdf.worker.min.js';
  return (pdfjsReady = Promise.resolve(pdfjsLib));
}

// ======================================================================== stato del modulo aperto
let cur = null;      // modello
let V = {};          // valori: nome campo -> stringa | boolean
let C = {};          // scelte (varianti): chiave -> valore
let SG = {};         // firme per chiave: { png, how: 'dito' | 'digitale' }
const CP = typeof COMPOSTI !== 'undefined' ? COMPOSTI : {};
const isComp = () => !!(cur && cur.compose);
// elenco delle firme del modulo aperto: fisse (dal modello) o calcolate dai dati (verbali composti)
function SIGS() {
  if (!cur) return [];
  const rowFilled = (s) => s.rows[0][2].some((n) => { const f = fieldByName(n); return f && hasValue(f); });
  const list = isComp() ? CP[cur.id].signers(V) : cur.sigs.map((s, i) => ({ ...s, key: String(i) })).filter((s) => !s.each || rowFilled(s));
  for (const s of list) if (!SG[s.key]) SG[s.key] = { png: null, how: s.digital && s.digitalDef ? 'digitale' : 'dito' };
  return list;
}
let shownRows = {};  // tabelle: gruppo -> righe visibili
let dirty = false;
let lastPdf = null;  // { key, bytes, name }

const list = (opts) => (typeof opts === 'string' ? (LISTS[opts] || { opts: [] }) : { opts: opts || [] });
const labelOf = (f) => f.l || 'Campo';
const visible = (f) => !f.show || f.show.split('|').some((cond) => {
  if (cond.startsWith('n:')) { const v = V[cond.slice(2)]; return v === true || (typeof v === 'string' && v.trim() !== ''); }
  const [k, v] = cond.split('='); return (C[k] ?? '') === v;
});

function defaults(m) {
  V = {}; C = {}; SG = {}; shownRows = {};
  if (m.compose) { compDefaults(m); dirty = false; lastPdf = null; return; }
  for (const ch of m.choices || []) C[ch.k] = ch.def ?? '';
  for (const f of m.fields) {
    if (f.def === 'today') V[f.n] = f.inp === 'date' ? isoDay() : itDate(isoDay());
    else if (f.def === 'luogodata') V[f.n] = `${CONFIG.luogo}, ${itDate(isoDay())}`;
    else if (f.def === 'as') V[f.n] = schoolYear(new Date());
    else if (f.def != null) V[f.n] = f.def;
  }
  dirty = false; lastPdf = null;
}

async function openForm(id) {
  const m = ALL[id];
  if (!m) return;
  if (cur && dirty && cur.id !== id && !confirm('Hai dati non salvati nel modulo aperto. Vuoi davvero cambiare modulo? I dati verranno cancellati.')) return;
  cur = m;
  defaults(m);
  history.replaceState(null, '', '#m=' + id);
  $('#pick').hidden = true; $('#fill').hidden = false;
  SHOWN_BY.clear();
  for (const f of m.fields) for (const c of (f.show || '').split('|')) if (c.startsWith('n:')) SHOWN_BY.add(c.slice(2));
  renderHead();
  if (m.compose) compRenderForm(); else renderForm();
  renderPads(); updateProgress();
  show('compila');
  if (m.compose) compPreview(true); else await renderPreview();
}
function closeForm() {
  if (dirty && !confirm('Uscire dal modulo? I dati inseriti verranno cancellati.')) return;
  cur = null; V = {}; SG = {}; dirty = false; lastPdf = null;
  $('#fill').hidden = true; $('#pick').hidden = false; $('#bar').hidden = true;
  $('#pvPages').innerHTML = '';
  history.replaceState(null, '', '#compila');
}
$('#back').addEventListener('click', closeForm);

function renderHead() {
  const m = cur;
  $('#headCard').innerHTML = `<div class="row"><span class="code" style="color:var(--accent);font-weight:700;font-size:13px">${esc(m.code)}</span></div>
    <h1>${esc(m.title)}</h1><p class="lead" style="margin:0">${esc(m.desc)}</p>
    <div class="meta"><span class="badge">${esc(CATS[m.cat])}</span><span class="badge">${m.pages} pagin${m.pages === 1 ? 'a' : 'e'}</span>
      <button class="btn small" id="blank" type="button">Scarica il modulo vuoto</button>
      ${m.attach ? `<a class="btn small" href="${attachUrl(m.attach)}" target="_blank" rel="noopener">Allegato: ${esc(m.attach.replace(/\.pdf$/i, ''))}</a>` : ''}</div>
    ${m.sens ? '<p class="notice warn">Questo modulo contiene dati personali che richiedono particolare tutela (salute, minori, situazioni familiari). Compilalo su un dispositivo tuo o della scuola e invialo solo a indirizzi istituzionali.</p>' : ''}
    ${m.note ? `<p class="notice info">${esc(m.note)}</p>` : ''}`;
  $('#blank').addEventListener('click', downloadBlank);
}

// ======================================================================== modulo
function controlFor(f, idp) {
  const id = idp + f.n;
  const val = V[f.n] ?? '';
  const ph = f.ph ? ` placeholder="${esc(f.ph)}"` : '';
  const common = `id="${id}" data-n="${esc(f.n)}"${f.req ? ' aria-required="true"' : ''}`;
  if (f.t === 'combo') {
    const L = f.opts || [];
    return `<select ${common}><option value=""></option>${L.map((o) => `<option${o === val ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  }
  if (f.opts === '@CLASSE') {
    const [a, s] = (val.match(/^(\d\^?)\s*([A-Z]?)$/) || ['', '', '']).slice(1);
    return `<div class="duo" data-classe="${esc(f.n)}"><select ${common} data-part="a" aria-label="Anno"><option value="">Anno</option>${LISTS['@ANNO'].opts.map((o) => `<option${o === a ? ' selected' : ''}>${o}</option>`).join('')}</select>
      <select data-n="${esc(f.n)}" data-part="s" aria-label="Sezione"><option value="">Sezione</option>${LISTS['@SEZ'].opts.map((o) => `<option${o === s ? ' selected' : ''}>${o}</option>`).join('')}</select></div>`;
  }
  if (f.opts) {
    const L = list(f.opts);
    const strict = f.strict ?? L.strict;
    const inList = !val || L.opts.includes(val);
    const sel = `<select ${common} data-list="1"><option value=""></option>${L.opts.map((o) => `<option${o === val ? ' selected' : ''}>${esc(o)}</option>`).join('')}${strict ? '' : `<option value="__altro"${inList ? '' : ' selected'}>Altro…</option>`}</select>`;
    return strict ? sel : sel + `<input type="text" data-n="${esc(f.n)}" data-other="1" aria-label="${esc(labelOf(f))}: altro" placeholder="Scrivi…" value="${inList ? '' : esc(val)}"${inList ? ' hidden' : ''}>`;
  }
  if (f.multi) return `<textarea ${common}${ph} rows="3">${esc(val)}</textarea>`;
  const type = { date: 'date', time: 'time', email: 'email', tel: 'tel' }[f.inp] || 'text';
  const extra = f.inp === 'num' ? ' inputmode="numeric"' : f.inp === 'cf' ? ' maxlength="16" autocapitalize="characters" spellcheck="false"' : '';
  let v = val;
  if (type === 'date' && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) v = '';
  return `<input type="${type}" ${common}${ph}${extra} value="${esc(v)}">`;
}

function fieldHtml(f) {
  if (f.t === 'check') {
    return `<label class="chk" data-wrap="${esc(f.n)}"><input type="checkbox" data-n="${esc(f.n)}" ${V[f.n] ? 'checked' : ''}><span>${esc(labelOf(f))}</span></label>`;
  }
  const lab = labelOf(f);
  return `<div class="fld" data-wrap="${esc(f.n)}"><label for="i_${esc(f.n)}" class="${f.req ? 'req' : ''}">${esc(lab)}</label>${controlFor(f, 'i_')}
    ${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}<span class="msg" hidden></span></div>`;
}

function radioGroupHtml(fs) {
  const g = fs[0].rg;
  return `<div class="fld" data-rg="${esc(g)}"><span class="lab">${esc(fs[0].rgl || 'Scegli un’opzione')}</span><div class="choice">
    ${fs.map((f) => `<label class="chk"><input type="radio" name="rg_${esc(g)}" data-n="${esc(f.n)}" data-rgi="${esc(g)}" ${V[f.n] ? 'checked' : ''}><span>${esc(labelOf(f))}</span></label>`).join('')}
    <button type="button" class="btn small" data-rgclear="${esc(g)}" style="justify-self:start">Nessuna</button></div></div>`;
}

function gridParts(fs) {
  const rows = [...new Set(fs.map((f) => f.grid.row))].sort((a, b) => a - b);
  const cols = [...new Set(fs.map((f) => f.grid.col))].sort((a, b) => a - b);
  const at = {};
  for (const f of fs) at[f.grid.row + ',' + f.grid.col] = f;
  const split = (l) => { const i = (l || '').lastIndexOf(' – '); return i < 0 ? ['', l || ''] : [l.slice(0, i), l.slice(i + 3)]; };
  const colLab = cols.map((c) => { const f = rows.map((r) => at[r + ',' + c]).find(Boolean); return f.gl || split(f.l)[1]; });
  const rowLab = rows.map((r) => { const f = cols.map((c) => at[r + ',' + c]).find(Boolean); return split(f.l)[0]; });
  const fixed = fs[0].gfixed ?? (new Set(rowLab.filter(Boolean)).size === rows.length && rows.length <= 14);
  return { rows, cols, at, colLab, rowLab, fixed };
}
function gridHtml(fs) {
  const g = fs[0].grid.g;
  const P = gridParts(fs);
  const used = P.rows.filter((r) => P.cols.some((c) => { const f = P.at[r + ',' + c]; return f && V[f.n]; }));
  const lastUsed = used.length ? P.rows.indexOf(used[used.length - 1]) + 1 : 0;
  const n = P.fixed ? P.rows.length : Math.max(shownRows[g] || 0, lastUsed, Math.min(fs[0].gmin || 1, P.rows.length));
  shownRows[g] = n;
  const head = `<tr>${P.rowLab.some(Boolean) ? '<th></th>' : '<th>#</th>'}${P.colLab.map((l) => `<th>${esc(l)}</th>`).join('')}</tr>`;
  const body = P.rows.slice(0, n).map((r, i) => `<tr><td class="rn">${esc(P.rowLab[i] || String(i + 1))}</td>${P.cols.map((c) => {
    const f = P.at[r + ',' + c];
    if (!f) return '<td></td>';
    if (f.t === 'check') return `<td class="ck"><input type="checkbox" data-n="${esc(f.n)}" aria-label="${esc(labelOf(f))}" ${V[f.n] ? 'checked' : ''}></td>`;
    return `<td data-wrap="${esc(f.n)}">${controlFor(f, 'i_').replace('<input ', `<input aria-label="${esc(labelOf(f))}" `)}</td>`;
  }).join('')}</tr>`).join('');
  return `${fs[0].gtitle ? `<h3>${esc(fs[0].gtitle)}</h3>` : ''}<div class="grid-wrap"><table class="grid" data-grid="${esc(g)}"><thead>${head}</thead><tbody>${body}</tbody></table></div>
    ${n < P.rows.length ? `<button type="button" class="btn small addrow" data-addrow="${esc(g)}">+ Aggiungi riga (${n} di ${P.rows.length})</button>` : ''}`;
}

function renderForm() {
  const m = cur;
  const parts = [];
  const hasSec = m.fields.some((f) => f.sec);
  let page = -1;
  const doneGrid = new Set(), doneRg = new Set();
  if ((m.choices || []).length) {
    parts.push('<div class="sec-h">Scelte del modulo</div>');
    for (const ch of m.choices) {
      parts.push(`<div class="fld" data-choice="${esc(ch.k)}"><span class="lab">${esc(ch.l)}</span><div class="choice">${ch.opts.map((o) =>
        `<label class="chk"><input type="radio" name="ch_${esc(ch.k)}" data-ch="${esc(ch.k)}" value="${esc(o.v)}" ${C[ch.k] === o.v ? 'checked' : ''}><span>${esc(o.l)}</span></label>`).join('')}</div>
        ${ch.hint ? `<span class="hint">${esc(ch.hint)}</span>` : ''}</div>`);
    }
  }
  for (const f of m.fields) {
    if (f.hidden) continue;
    if (f.sec) parts.push(`<div class="sec-h">${esc(f.sec)}</div>`);
    else if (!hasSec && f.p !== page && m.pages > 1) parts.push(`<div class="sec-h">Pagina ${f.p + 1}</div>`);
    page = f.p;
    const wrapShow = (html) => (f.show ? `<div data-show="${esc(f.show)}"${visible(f) ? '' : ' hidden'}>${html}</div>` : html);
    if (f.grid) {
      if (doneGrid.has(f.grid.g)) continue;
      doneGrid.add(f.grid.g);
      parts.push(wrapShow(gridHtml(m.fields.filter((x) => x.grid && x.grid.g === f.grid.g))));
    } else if (f.chars) {  // una lettera per casella (es. IBAN): nel modulo un solo campo
      const g = cur.fields.filter((x) => x.chars === f.chars);
      if (g[0] !== f) continue;
      parts.push(wrapShow(fieldHtml(Object.assign({}, f, { hint: f.hint || `${g.length} caratteri, uno per casella.` }))));
    } else if (f.flow) {
      const g = cur.fields.filter((x) => x.flow === f.flow);
      if (g[0] !== f) continue;
      parts.push(wrapShow(fieldHtml(Object.assign({}, f, { multi: true, hint: f.hint || (g.length > 1 ? `Nel documento ci sono ${g.length} righe: il testo va a capo da solo.` : '') }))));
    } else if (f.rg) {
      if (doneRg.has(f.rg)) continue;
      doneRg.add(f.rg);
      parts.push(wrapShow(radioGroupHtml(m.fields.filter((x) => x.rg === f.rg))));
    } else parts.push(wrapShow(fieldHtml(f)));
  }
  $('#form').innerHTML = `<div class="card">${parts.join('')}</div>`;
}

function fieldByName(n) { return cur.fields.find((f) => f.n === n); }
function setValue(n, v) {
  V[n] = v; dirty = true; lastPdf = null;
  updateOverlay(n); updateProgress();
  for (const x of cur.fields) if (x.same === n) updateOverlay(x.n);
  if (cur.sigs.some((s) => s.rows)) {
    cur.sigs.forEach((s, i) => { if (s.rows) updateSigOverlay(i); });
    if (cur.sigs.some((s) => s.each) && SIGS().map((s) => s.key + s.l).join('|') !== padKeys) renderPads();
  }
  if (SHOWN_BY.has(n)) applyShow();
  const w = $(`[data-wrap="${CSS.escape(n)}"]`);
  if (w && w.classList.contains('bad')) validateField(fieldByName(n));
}

$('#form').addEventListener('input', onInput);
$('#form').addEventListener('change', onInput);
function onInput(e) {
  if (isComp()) return compOnInput(e);
  const el = e.target;
  if (el.dataset.ch) { C[el.dataset.ch] = el.value; dirty = true; lastPdf = null; applyShow(); refreshHides(); updateProgress(); return; }
  const n = el.dataset.n;
  if (!n) return;
  const f = fieldByName(n);
  if (el.dataset.rgi) {
    for (const x of cur.fields.filter((x) => x.rg === el.dataset.rgi)) { V[x.n] = x.n === n; updateOverlay(x.n); }
    dirty = true; lastPdf = null; updateProgress(); return;
  }
  if (el.type === 'checkbox') return setValue(n, el.checked);
  if (el.dataset.part) {
    const box = el.closest('[data-classe]');
    const a = $('[data-part="a"]', box).value, s = $('[data-part="s"]', box).value;
    return setValue(n, a || s ? `${a}${s}` : '');
  }
  if (el.dataset.list) {
    const other = el.parentElement.querySelector(`[data-other][data-n="${CSS.escape(n)}"]`);
    if (el.value === '__altro') { if (other) { other.hidden = false; if (e.type === 'change') other.focus(); } return setValue(n, other ? other.value : ''); }
    if (other) other.hidden = true;
    return setValue(n, el.value);
  }
  let v = el.value;
  if (f && f.inp === 'cf') { v = v.toUpperCase().replace(/\s/g, ''); if (el.value !== v) el.value = v; }
  setValue(n, v);
}
$('#form').addEventListener('click', (e) => {
  if (isComp()) { compClick(e); return; }
  const add = e.target.closest('[data-addrow]');
  if (add) {
    const g = add.dataset.addrow;
    shownRows[g] = (shownRows[g] || 1) + 1;
    const fs = cur.fields.filter((x) => x.grid && x.grid.g === g);
    const box = add.previousElementSibling.closest('.grid-wrap');
    const tmp = document.createElement('div');
    tmp.innerHTML = gridHtml(fs);
    box.replaceWith(...tmp.querySelectorAll('.grid-wrap'));
    add.replaceWith(...(tmp.querySelector('[data-addrow]') ? [tmp.querySelector('[data-addrow]')] : []));
    const rows = $$(`[data-grid="${CSS.escape(g)}"] tbody tr`);
    rows[rows.length - 1]?.querySelector('input,select')?.focus();
    return;
  }
  const rc = e.target.closest('[data-rgclear]');
  if (rc) {
    for (const x of cur.fields.filter((x) => x.rg === rc.dataset.rgclear)) { V[x.n] = false; updateOverlay(x.n); }
    $$(`input[data-rgi="${CSS.escape(rc.dataset.rgclear)}"]`).forEach((i) => { i.checked = false; });
    dirty = true; lastPdf = null; updateProgress();
  }
});
$('#form').addEventListener('focusin', (e) => { const n = e.target.dataset?.n; if (n) highlight(n, true); });
$('#form').addEventListener('focusout', (e) => { const n = e.target.dataset?.n; if (n) highlight(n, false); });

const SHOWN_BY = new Set();
function applyShow() {
  for (const el of $$('[data-show]', $('#form'))) el.hidden = !visible({ show: el.dataset.show });
  for (const f of cur.fields) updateOverlay(f.n);
}

// ======================================================================== valori per il PDF
// misura del testo come nel PDF (Arial ha le stesse larghezze di Helvetica)
const MEAS = document.createElement('canvas').getContext('2d');
const textW = (t, size) => { MEAS.font = `${size}px Arial, Helvetica, sans-serif`; return MEAS.measureText(t).width; };
function flowSplit(name) {
  const g = cur.fields.filter((x) => x.flow === name);
  const text = String(V[g[0].n] ?? '').replace(/\r/g, '');
  const res = g.map(() => '');
  if (!text.trim() || !visible(g[0])) return { g, res, over: false };
  const NL = '\n';
  const words = [];
  for (const [i, para] of text.split(NL).entries()) { if (i) words.push(NL); words.push(...para.split(/\s+/).filter(Boolean)); }
  let k = 0;
  for (let i = 0; i < g.length && k < words.length; i++) {
    const f = g[i];
    const size = Math.min(10, Math.max(6, (f.r[3] - f.r[1]) * 0.82));
    const w = f.r[2] - f.r[0] - 6;
    let line = '';
    if (words[k] === NL) k++;
    while (k < words.length && words[k] !== NL) {
      const t = line ? line + ' ' + words[k] : words[k];
      if (line && textW(t, size) > w && i < g.length - 1) break;
      line = t; k++;
    }
    res[i] = line;
  }
  if (k < words.length) res[g.length - 1] += ' ' + words.slice(k).filter((x) => x !== NL).join(' ');
  return { g, res, over: k < words.length };
}
function ticked(n) {
  for (const ch of cur.choices || []) for (const o of ch.opts) if (C[ch.k] === o.v && (o.tick || []).includes(n)) return true;
  return false;
}
function out(f) {
  if (f.chars) {
    const g = cur.fields.filter((x) => x.chars === f.chars);
    return String(V[g[0].n] ?? '').replace(/\s+/g, '').toUpperCase()[g.indexOf(f)] || '';
  }
  if (f.same) { const g = fieldByName(f.same); return g ? out(g) : ''; }
  if (f.flow) { const { g, res } = flowSplit(f.flow); return res[g.indexOf(f)] || ''; }
  const v = V[f.n];
  if (f.t === 'check') return !!v || ticked(f.n);
  if (v == null || v === '') return '';
  if (f.inp === 'date') return itDate(v);
  if (f.inp === 'time') return String(v).replace(':', '.');
  return String(v);
}
function active(f) { return visible(f); }
function keepPages() {
  for (const ch of cur.choices || []) for (const o of ch.opts) if (C[ch.k] === o.v && o.pages) return o.pages;
  return null;
}
function hides() {
  const h = [];
  for (const ch of cur.choices || []) for (const o of ch.opts) if (C[ch.k] === o.v) h.push(...(o.hide || []));
  if (!isComp()) cur.sigs.forEach((s, i) => { if (s.digital && SG[i]?.how === 'dito' && SG[i]?.png) h.push(...s.digital); });
  return h;
}

// ======================================================================== anteprima
let PV = [];
async function renderPreview() {
  const m = cur;
  const box = $('#pvPages');
  box.innerHTML = '<p class="small">Caricamento del documento…</p>';
  PV = [];
  let doc;
  try {
    const lib = await pdfjs();
    doc = await lib.getDocument({ data: (await template(m.id)).slice() }).promise;
  } catch (e) { box.innerHTML = '<p class="small">Anteprima non disponibile su questo dispositivo. Il PDF verrà comunque creato correttamente.</p>'; return; }
  if (cur !== m) return;
  box.innerHTML = '';
  const W = m.size[0];
  for (let i = 0; i < doc.numPages; i++) {
    const page = await doc.getPage(i + 1);
    const vp1 = page.getViewport({ scale: 1 });
    const div = document.createElement('div');
    div.className = 'pv-page';
    div.style.aspectRatio = `${vp1.width} / ${vp1.height}`;
    const cv = document.createElement('canvas');
    div.appendChild(cv);
    box.appendChild(div);
    const scale = Math.min(2.2, Math.max(1.2, (box.clientWidth || 600) * (window.devicePixelRatio || 1) / vp1.width));
    const vp = page.getViewport({ scale });
    cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp, annotationMode: 0 }).promise;
    PV.push({ div, w: vp1.width, h: vp1.height });
    if (cur !== m) return;
  }
  const pos = (el, p, r) => {
    const P = PV[p]; if (!P) return;
    el.style.left = (r[0] / P.w * 100) + '%'; el.style.top = (r[1] / P.h * 100) + '%';
    el.style.width = ((r[2] - r[0]) / P.w * 100) + '%'; el.style.height = ((r[3] - r[1]) / P.h * 100) + '%';
    P.div.appendChild(el);
  };
  const ro = new ResizeObserver(() => { for (const P of PV) P.div.style.setProperty('--k', P.div.clientWidth / P.w); });
  for (const P of PV) ro.observe(P.div);
  for (const f of m.fields) {
    const places = [[f.p, f.r], ...(f.alsoR || [])];
    f._ov = places.map(([p, r]) => {
      const el = document.createElement('div');
      el.className = 'pv-f' + (f.multi ? ' multi' : '') + (f.t === 'check' ? ' ck' : '');
      const hpt = r[3] - r[1];
      const size = f.t === 'check' ? Math.min(11, hpt) : f.multi ? 10 : Math.min(10, Math.max(6, hpt * 0.82));
      el.style.fontSize = `calc(var(--k, 1) * ${size}px)`;
      el.dataset.size = size;
      pos(el, p, r);
      return el;
    });
    updateOverlay(f.n);
  }
  m.sigs.forEach((s, i) => {
    s._ov = (s.rows ? s.rows.map(([p, r]) => [p, r]) : [[s.p, s.r], ...(s.also || [])]).map(([p, r]) => { const el = document.createElement('div'); el.className = 'pv-sig empty'; pos(el, p, r); return el; });
    updateSigOverlay(i);
  });
  refreshHides();
}
function updateOverlay(n, inner) {
  const f = fieldByName(n);
  if (!f) return;
  if (f.chars && !inner) { for (const x of cur.fields.filter((x) => x.chars === f.chars)) updateOverlay(x.n, true); return; }
  if (f.flow && !inner) {
    const { g, over } = flowSplit(f.flow);
    for (const x of g) updateOverlay(x.n, true);
    const w = $(`[data-wrap="${CSS.escape(g[0].n)}"] .hint`);
    if (w) w.textContent = over ? 'Il testo è più lungo dello spazio del modulo: nell’ultima riga verrà rimpicciolito. Accorcialo se puoi.' : (g.length > 1 ? `Nel documento ci sono ${g.length} righe: il testo va a capo da solo.` : '');
    return;
  }
  if (!f._ov) return;
  const v = active(f) ? out(f) : '';
  for (const el of f._ov) {
    el.textContent = f.t === 'check' ? (v ? 'X' : '') : v;
    if (f.t !== 'check' && !f.multi && v) {  // riduce il testo lungo come farà il PDF
      const base = +el.dataset.size;
      const wpt = (f.r[2] - f.r[0]) - 4;
      const est = v.length * base * 0.5;
      el.style.fontSize = `calc(var(--k, 1) * ${Math.max(5, Math.min(base, base * wpt / est))}px)`;
    }
  }
}
function updateSigOverlay(i) {
  if (isComp()) { compPreview(); return; }
  const s = cur.sigs[i];
  if (!s || !s._ov) return;
  s._ov.forEach((el, k) => {
    const on = !s.rows || s.rows[k][2].some((n) => { const f = fieldByName(n); return f && hasValue(f); });
    el.innerHTML = SG[i].png && on ? `<img alt="" src="${SG[i].png}">` : '';
    el.classList.toggle('empty', on && !SG[i].png && SG[i].how !== 'digitale');
    el.style.display = on ? '' : 'none';
  });
}
function refreshHides() {
  $$('.pv-hide', $('#pvPages')).forEach((el) => el.remove());
  for (const [p, r] of hides()) {
    const P = PV[p]; if (!P) continue;
    const el = document.createElement('div'); el.className = 'pv-hide';
    el.style.left = (r[0] / P.w * 100) + '%'; el.style.top = (r[1] / P.h * 100) + '%';
    el.style.width = ((r[2] - r[0]) / P.w * 100) + '%'; el.style.height = ((r[3] - r[1]) / P.h * 100) + '%';
    P.div.appendChild(el);
  }
}
function highlight(n, on) {
  const f = fieldByName(n);
  if (!f || !f._ov) return;
  for (const el of f._ov) el.classList.toggle('on', on);
  if (on && window.matchMedia('(min-width: 1001px)').matches) {
    const el = f._ov[0], box = $('#preview');
    const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    if (top < box.scrollTop + 40 || top > box.scrollTop + box.clientHeight - 60) box.scrollTo({ top: top - box.clientHeight / 3, behavior: 'smooth' });
  }
}
$('#pvToggle').addEventListener('click', () => {
  const p = $('#preview'); p.classList.toggle('closed');
  $('#pvToggle').textContent = p.classList.contains('closed') ? 'Mostra' : 'Nascondi';
});
if (window.matchMedia('(max-width: 1000px)').matches) $('#preview').classList.add('closed');

// ======================================================================== firme
let padKeys = '';
function renderPads() {
  const list = SIGS();
  padKeys = list.map((s) => s.key + s.l).join('|');
  $('#sigCard').hidden = !list.length;
  $('#pads').innerHTML = list.map((s) => { const i = s.key; return `<div class="pad" data-i="${esc(i)}">
      <div class="pad-h"><b>${esc(s.l)}</b>${s.opt ? '<span class="small">facoltativa</span>' : ''}</div>
      ${s.rows ? '<p class="small" style="margin:0 0 8px">La firma viene riportata su ogni riga compilata del registro.</p>' : ''}
      ${s.digital ? `<div class="how"><label><input type="radio" name="how${i}" value="dito" ${SG[i].how === 'dito' ? 'checked' : ''}> Firmo ora col dito</label>
        <label><input type="radio" name="how${i}" value="digitale" ${SG[i].how === 'digitale' ? 'checked' : ''}> Firma digitale successiva</label></div>` : ''}
      <div class="padbox"${SG[i].how === 'digitale' ? ' hidden' : ''}><canvas aria-label="Riquadro firma: ${esc(s.l)}"></canvas>
      <div class="pad-tools"><button type="button" class="btn small" data-clear="${i}">Cancella firma</button><span class="st">Firma qui sopra</span></div></div>
      <p class="small digi"${SG[i].how === 'digitale' ? '' : ' hidden'}>Lo spazio firma resta vuoto e la dicitura sulla firma digitale resta nel documento.</p>
    </div>`; }).join('');
  $$('.pad').forEach((el) => setupPad(el, el.dataset.i));
}
function setupPad(el, i) {
  const cv = $('canvas', el);
  const ctx = cv.getContext('2d');
  let drawing = false, last = null, inked = false;
  const fit = () => {
    const r = cv.getBoundingClientRect();
    if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0b2a6b';
    if (SG[i].png) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height); img.src = SG[i].full || SG[i].png; }
  };
  new ResizeObserver(fit).observe(cv);
  const pt = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure || 0.5 }; };
  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cv.setPointerCapture(e.pointerId); drawing = true; last = pt(e); });
  cv.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = pt(e);
    ctx.lineWidth = 1.6 + 1.8 * (e.pointerType === 'pen' ? p.p : 0.55);
    ctx.beginPath(); ctx.moveTo(last.x, last.y);
    const mx = (last.x + p.x) / 2, my = (last.y + p.y) / 2;
    ctx.quadraticCurveTo(last.x, last.y, mx, my); ctx.lineTo(p.x, p.y); ctx.stroke();
    last = p; inked = true;
  });
  const end = () => {
    if (!drawing) return;
    drawing = false;
    if (inked) { SG[i].full = cv.toDataURL('image/png'); SG[i].png = trimmed(cv); el.classList.add('done'); $('.st', el).textContent = 'Firma acquisita'; dirty = true; lastPdf = null; updateSigOverlay(i); updateProgress(); }
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end); cv.addEventListener('pointerleave', end);
  $('[data-clear]', el).addEventListener('click', () => {
    ctx.clearRect(0, 0, cv.width, cv.height); SG[i].png = null; SG[i].full = null; inked = false;
    el.classList.remove('done'); $('.st', el).textContent = 'Firma qui sopra'; lastPdf = null; updateSigOverlay(i); refreshHides(); updateProgress();
  });
  $$('input[name="how' + i + '"]', el).forEach((r) => r.addEventListener('change', () => {
    SG[i].how = r.value; lastPdf = null;
    $('.padbox', el).hidden = r.value === 'digitale'; $('.digi', el).hidden = r.value !== 'digitale';
    if (r.value === 'digitale') { SG[i].png = null; SG[i].full = null; el.classList.remove('done'); } else fit();
    updateSigOverlay(i); refreshHides(); updateProgress();
  }));
  if (SG[i].png) el.classList.add('done');
}
function trimmed(cv) {  // ritaglia lo spazio vuoto intorno alla firma
  const ctx = cv.getContext('2d');
  const { width: w, height: h } = cv;
  const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (d[(y * w + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const m = 6; x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w, x1 + m); y1 = Math.min(h, y1 + m);
  const o = document.createElement('canvas'); o.width = x1 - x0; o.height = y1 - y0;
  o.getContext('2d').drawImage(cv, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
  return o.toDataURL('image/png');
}
window.addEventListener('resize', () => {});

// ======================================================================== controlli
function hasValue(f) { const v = V[f.n]; return f.t === 'check' ? !!v : v != null && String(v).trim() !== ''; }
const CF_RX = /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/;
function fieldError(f) {
  if (!active(f)) return '';
  if (f.req && !hasValue(f)) return 'Campo obbligatorio';
  const v = String(V[f.n] ?? '').trim();
  if (!v) return '';
  if (f.inp === 'cf' && !CF_RX.test(v) && !/^\d{11}$/.test(v)) return 'Codice fiscale non valido (16 caratteri)';
  if (f.inp === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return 'Indirizzo email non valido';
  return '';
}
function validateField(f) {
  const w = $(`[data-wrap="${CSS.escape(f.n)}"]`);
  const err = fieldError(f);
  if (w) { w.classList.toggle('bad', !!err); const msg = $('.msg', w); if (msg) { msg.textContent = err; msg.hidden = !err; } }
  return err;
}
function validate() {
  const errs = [];
  if (isComp()) errs.push(...compErrors()); else for (const f of cur.fields) { const e = validateField(f); if (e) errs.push([f, e]); }
  SIGS().forEach((s) => { if (!s.opt && SG[s.key].how !== 'digitale' && !SG[s.key].png) errs.push([{ n: '__sig' + s.key, l: 'Firma: ' + s.l }, 'Manca la firma']); });
  const box = $('#errs');
  if (!errs.length) { box.hidden = true; return true; }
  box.hidden = false;
  box.innerHTML = `<b>Prima di creare il PDF:</b><ul style="margin:6px 0 0;padding-left:18px">${errs.slice(0, 8).map(([f, e]) => `<li><button type="button" data-go="${esc(f.n)}">${esc(labelOf(f))}</button>: ${esc(e)}</li>`).join('')}${errs.length > 8 ? `<li>e altri ${errs.length - 8}</li>` : ''}</ul>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return false;
}
$('#errs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]'); if (!b) return;
  const n = b.dataset.go;
  const el = n.startsWith('__sig') ? $(`.pad[data-i="${CSS.escape(n.slice(5))}"]`) : $(`[data-n="${CSS.escape(n)}"], [data-k="${CSS.escape(n)}"]`, $('#form'));
  if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus?.({ preventScroll: true }); }
});
function updateProgress() {
  if (!cur) return;
  if (isComp()) { compProgress(); return; }
  const fs = cur.fields.filter((f) => !f.hidden && active(f) && !(f.flow && cur.fields.find((x) => x.flow === f.flow) !== f)
    && !(f.chars && cur.fields.find((x) => x.chars === f.chars) !== f));
  const filled = fs.filter(hasValue).length;
  const sl = SIGS();
  const need = sl.filter((s) => !s.opt).length;
  const signed = sl.filter((s) => SG[s.key]?.png || SG[s.key]?.how === 'digitale').length;
  $('#progress').textContent = `${filled} di ${fs.length} campi compilati` + (sl.length ? ` · firme ${Math.min(signed, sl.length)}/${need || sl.length}` : '');
}

// ======================================================================== creazione del PDF
const REF_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newRef = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => REF_CH[b % REF_CH.length]).join('');
function tagValues() {
  const t = {};
  for (const f of cur.fields) {
    if (!f.tag || !active(f) || !hasValue(f) || t[f.tag]) continue;
    t[f.tag] = f.flow ? String(V[f.n]) : out(f);
  }
  return t;
}
function summary() {
  const rows = [];
  for (const ch of cur.choices || []) { const o = ch.opts.find((o) => o.v === C[ch.k]); if (o) rows.push([ch.l, o.l]); }
  for (const f of cur.fields) {
    if (f.hidden || !active(f) || !hasValue(f)) continue;
    if (f.flow) { if (cur.fields.find((x) => x.flow === f.flow) === f) rows.push([labelOf(f), String(V[f.n])]); continue; }
    if (f.chars) { if (cur.fields.find((x) => x.chars === f.chars) === f) rows.push([labelOf(f), String(V[f.n])]); continue; }
    rows.push([labelOf(f), f.t === 'check' ? 'sì' : out(f)]);
  }
  return rows;
}
async function buildPdf(sender, contatto) {
  const key = JSON.stringify([V, C, Object.entries(SG).map(([k, s]) => [k, s.how, s.png && s.png.length]), sender || '', contatto || '']);
  if (lastPdf && lastPdf.key === key) return lastPdf;
  const m = cur;
  const ref = lastPdf?.ref || newRef();
  const now = new Date();
  if (m.compose) {
    const meta = Object.assign(compMeta(ref, now, sender), { contatto: contatto || '' });
    const bytes = await compBytes({ meta, metaKey: CONFIG.metaKey, title: `${m.code} – ${m.title}`, keywords: [m.code, 'rif. ' + ref] });
    lastPdf = { key, bytes, name: `${m.code.replace(/[^A-Za-z0-9]+/g, '')}_${isoDay(now)}_${ref}.pdf`, ref, meta };
    return lastPdf;
  }
  const text = {}, check = [];
  for (const f of m.fields) {
    if (!active(f)) continue;
    const v = out(f);
    const names = [f.n, ...(f.also || [])];
    if (f.t === 'check') { if (v) check.push(...names); } else if (v) for (const n of names) text[n] = v;
  }
  const sigs = m.sigs.map((s, i) => {
    if (!SG[i]) return { png: null };
    if (!s.rows) return { png: SG[i].png, p: s.p, r: s.r, also: s.also || [] };
    const cells = s.rows.filter(([, , ns]) => ns.some((n) => { const f = fieldByName(n); return f && hasValue(f); }));
    return cells.length ? { png: SG[i].png, p: cells[0][0], r: cells[0][1], also: cells.slice(1).map(([p, r]) => [p, r]) } : { png: null };
  });
  const meta = {
    v: 1, app: CONFIG.app, ref, form: m.id, code: m.code, title: m.title, cat: m.cat, sens: !!m.sens,
    created: now.toISOString(), as: schoolYear(now), from: sender || '', contatto: contatto || '', tags: tagValues(), data: summary(),
    sigs: SIGS().map((s) => ({ l: s.l, how: SG[s.key].png ? 'dito' : SG[s.key].how === 'digitale' ? 'digitale' : 'mancante' })),
  };
  if (meta.tags.as) meta.as = meta.tags.as;
  const bytes = await makePdf(PDFLib, await template(m.id), {
    text, check, sigs, hide: hides(), keep: keepPages(), meta, metaKey: CONFIG.metaKey, title: `${m.code} – ${m.title}`, keywords: [m.code, 'rif. ' + ref],
  });
  const name = `${m.code.replace(/[^A-Za-z0-9]+/g, '')}_${isoDay(now)}_${ref}.pdf`;
  lastPdf = { key, bytes, name, ref, meta };
  return lastPdf;
}
function saveBytes(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function busy(btn, fn) {
  const t = btn.textContent; btn.disabled = true; btn.textContent = 'Preparo il PDF…';
  try { return await fn(); } catch (e) { console.error(e); alert('Non è stato possibile creare il PDF: ' + (e.message || e)); } finally { btn.disabled = false; btn.textContent = t; }
}
$('#dlBtn').addEventListener('click', () => {
  if (!validate()) return;
  busy($('#dlBtn'), async () => {
    const r = await buildPdf(senderName(), senderCont());
    saveBytes(r.bytes, r.name);
    $('#doneT').textContent = 'PDF scaricato';
    $('#doneP').innerHTML = `Il file <b>${esc(r.name)}</b> è nella cartella dei download. Riferimento: <b>${r.ref}</b>.`;
    $('#dlgDone').showModal();
  });
});
async function downloadBlank() {
  if (isComp()) {
    const keep = V; V = {};
    try { saveBytes(await compBytes({ title: cur.code }), `${cur.code.replace(/[^A-Za-z0-9]+/g, '')}_vuoto.pdf`); } finally { V = keep; }
    return;
  }
  const bytes = await template(cur.id);
  const pdf = await PDFLib.PDFDocument.load(bytes);
  try { pdf.getForm().flatten(); } catch (e) { /* */ }
  saveBytes(await pdf.save(), `${cur.code.replace(/[^A-Za-z0-9]+/g, '')}_vuoto.pdf`);
}

// ---------------------------------------------------------------- invio
function fillTo() {
  const opts = [...CONFIG.destinatari];
  if (CONFIG.casellaModuli) opts.unshift({ l: `Archivio moduli della scuola – ${CONFIG.casellaModuli}`, e: CONFIG.casellaModuli });
  if (cur.to) for (const t of [].concat(cur.to)) if (!opts.some((o) => o.e === t.e)) opts.unshift(t);
  $('#sTo').innerHTML = opts.map((o) => `<option value="${esc(o.e)}">${esc(o.l)}</option>`).join('') + '<option value="__altro">Altro indirizzo…</option>';
}
function recipient() { return $('#sTo').value === '__altro' ? $('#sOther').value.trim() : $('#sTo').value; }
function checkRecipient() {
  $('#sOtherW').hidden = $('#sTo').value !== '__altro';
  const to = recipient();
  const dom = CONFIG.casellaModuli ? CONFIG.casellaModuli.split('@')[1].toLowerCase() : '';
  const inst = /@(istruzione\.it|pec\.istruzione\.it|comprensivoalmese\.edu\.it|posta\.istruzione\.it)$/i.test(to) || (dom && to.toLowerCase().endsWith('@' + dom));
  const w = $('#sWarn');
  const msgs = [];
  if (cur.sens) msgs.push('Il modulo contiene dati personali che richiedono particolare tutela.');
  if (to && !inst) msgs.push('L’indirizzo scelto non è una casella istituzionale: verifica che sia quello giusto prima di inviare.');
  w.hidden = !msgs.length; w.textContent = msgs.join(' ');
}
$('#sTo').addEventListener('change', checkRecipient);
$('#sOther').addEventListener('input', checkRecipient);
const senderName = () => $('#sFrom').value.trim();
const senderCont = () => $('#sCont').value.trim();
function needSender() {
  if (senderName().length >= 3) return true;
  $('#sFrom').focus(); $('#sWarn').hidden = false; $('#sWarn').textContent = 'Scrivi il tuo nome e cognome: serve a chi riceve per sapere chi ha inviato il modulo.';
  return false;
}
$('#sendBtn').addEventListener('click', () => {
  if (!validate()) return;
  fillTo(); checkRecipient(); $('#sDone').hidden = true;
  if (!senderName()) { const t = tagValues(); if (t.persona) $('#sFrom').value = t.persona; }
  $('#sDirect').hidden = !CONFIG.invioDiretto;
  $('#sAltri').open = !CONFIG.invioDiretto;
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [new File([new Uint8Array(1)], 'x.pdf', { type: 'application/pdf' })] }));
  $('#sShare').hidden = !canShare;
  $('#sHow').textContent = canShare
    ? '“Condividi il PDF” apre l’elenco delle app (Gmail, Outlook…) con il file già allegato. “Apri l’email” scarica il PDF e prepara il messaggio: il file va allegato a mano.'
    : '“Apri l’email” scarica il PDF e apre il programma di posta con destinatario e oggetto già scritti: allega il file appena scaricato (cartella Download).';
  $('#dlgSend').showModal();
});
function mailText(r) {
  const subject = `[${cur.code}] ${cur.title} – ${itDate(isoDay())} (rif. ${r.ref})`;
  const from = $('#sFrom').value.trim();
  const body = `Buongiorno,\nin allegato il modulo «${cur.code} – ${cur.title}» compilato online.\nFile: ${r.name}\nRiferimento: ${r.ref}\n\n${from ? 'Cordiali saluti,\n' + from : 'Cordiali saluti'}`;
  return { subject, body };
}
$('#sShare').addEventListener('click', () => busy($('#sShare'), async () => {
  if (!needSender()) return;
  const r = await buildPdf(senderName(), senderCont());
  const file = new File([r.bytes], r.name, { type: 'application/pdf' });
  const t = mailText(r);
  try {
    await navigator.share({ files: [file], title: t.subject, text: t.body });
    $('#sDone').hidden = false; $('#sDone').textContent = 'Condivisione avviata. Controlla che il messaggio parta verso il destinatario corretto.';
  } catch (e) { if (e.name !== 'AbortError') alert('Condivisione non riuscita: usa “Apri l’email”.'); }
}));
$('#sMail').addEventListener('click', () => busy($('#sMail'), async () => {
  const to = recipient();
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) { alert('Indica un indirizzo email valido.'); return; }
  if (!needSender()) return;
  const r = await buildPdf(senderName(), senderCont());
  saveBytes(r.bytes, r.name);
  const t = mailText(r);
  const body = t.body.replace('in allegato il modulo', 'in allegato (file scaricato) il modulo');
  setTimeout(() => { location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(t.subject)}&body=${encodeURIComponent(body)}`; }, 400);
  $('#sDone').hidden = false;
  $('#sDone').innerHTML = `PDF scaricato (<b>${esc(r.name)}</b>). Nel messaggio che si apre, allega questo file prima di inviare.`;
}));

// invio diretto all'archivio della scuola (app web "Ricezione moduli")
function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
$('#sSend').addEventListener('click', () => busy($('#sSend'), async () => {
  if (!needSender()) return;
  $('#sWarn').hidden = true;
  const r = await buildPdf(senderName(), senderCont());
  const body = JSON.stringify({ v: 1, name: r.name, pdf: toB64(r.bytes), from: senderName(), contatto: senderCont() });
  let conferma = null;
  try {
    const res = await fetch(CONFIG.invioDiretto, { method: 'POST', body, redirect: 'follow' });
    conferma = await res.json();
  } catch (e) {
    // se il browser non può leggere la risposta, il modulo parte comunque (la scuola scarta i doppioni)
    try { await fetch(CONFIG.invioDiretto, { method: 'POST', body, mode: 'no-cors' }); conferma = { ok: true, ref: r.ref, senza: true }; } catch (e2) { conferma = null; }
  }
  if (!conferma) { alert('Invio non riuscito: controlla la connessione e riprova, oppure usa “Altri modi di invio”.'); return; }
  if (!conferma.ok) { alert(conferma.errore || 'La scuola non ha accettato il modulo.'); return; }
  $('#sDone').hidden = false;
  $('#sDone').innerHTML = `${conferma.senza ? 'Modulo inviato alla scuola.' : 'Modulo ricevuto dalla scuola.'} Riferimento: <b>${esc(r.ref)}</b>.
    Se vuoi tenerne una copia usa “Scarica una copia”, poi svuota il modulo.`;
}));
$('#sCopy').addEventListener('click', () => busy($('#sCopy'), async () => {
  const r = await buildPdf(senderName(), senderCont());
  saveBytes(r.bytes, r.name);
}));
if (CONFIG.archivioScuola) { $('#archScuola').hidden = false; $('#archLink').href = CONFIG.archivioScuola; }

// ---------------------------------------------------------------- svuota
function clearAll() {
  if (!cur) return;
  defaults(cur);
  if (isComp()) { compRenderForm(); renderPads(); updateProgress(); compPreview(true); $('#errs').hidden = true; $('#sFrom').value = ''; return; }
  renderForm(); renderPads(); updateProgress();
  for (const f of cur.fields) updateOverlay(f.n);
  cur.sigs.forEach((s, i) => updateSigOverlay(i));
  refreshHides();
  $('#errs').hidden = true; $('#sFrom').value = ''; $('#sCont').value = '';
}
$('#clear').addEventListener('click', () => { if (!dirty || confirm('Cancellare tutti i dati inseriti e le firme?')) clearAll(); });
$('#doneClear').addEventListener('click', () => { clearAll(); $('#dlgDone').close(); });
window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

// ======================================================================== archivio
let REC = [];
let sortKey = 'created', sortDir = -1;
const COLS = [
  ['created', 'Compilato il'], ['code', 'Modulo'], ['cat', 'Chi compila'], ['who', 'Interessato'], ['plesso', 'Plesso'],
  ['classe', 'Classe'], ['as', 'A.S.'], ['firma', 'Firme'], ['from', 'Inviato da'],
];
// stessi plessi e classi scritti in modi diversi dai vari modelli -> un solo nome, così i filtri li raggruppano
function canonPlesso(s) {
  const t = norm(s);
  if (!t) return '';
  if (t.includes('secondaria')) return 'Secondaria di I grado';
  const ord = t.includes('infanzia') ? 'Infanzia' : 'Primaria';
  for (const [k, l] of [['milanere', 'Milanere'], ['rivera', 'Rivera'], ['rubiana', 'Rubiana'], ['villar', 'Villar Dora'], ['almese', 'Almese']]) if (t.includes(k)) return `${ord} ${l}`;
  return s;
}
function canonClasse(s) {
  const t = norm(s).replace(/\s+/g, '');
  const n = { prima: '1', seconda: '2', terza: '3', quarta: '4', quinta: '5' };
  for (const [k, v] of Object.entries(n)) if (t.startsWith(k)) return v + '^' + t.slice(k.length).toUpperCase();
  const m = t.match(/^(\d)\^?([a-h]?)$/);
  if (m) return m[1] + '^' + m[2].toUpperCase();
  if (t.startsWith('inf')) return 'Infanzia';
  return s;
}
const mask = (s) => String(s || '').split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase() + '.').join(' ');
const named = (s) => ($('#showNames').checked ? s || '' : mask(s));
function firmaState(r) {
  const s = r.meta.sigs || [];
  if (!s.length || s.every((x) => x.how === 'dito')) return 'ok';
  if (s.some((x) => x.how === 'mancante')) return 'no';
  return 'dig';
}
const FIRMA_L = { ok: ['Complete', 'ok'], dig: ['Da firmare digitalmente', 'warn'], no: ['Mancanti', 'err'] };
async function loadFiles(files) {
  const pdfs = [...files].filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
  let ok = 0, other = 0, dup = 0;
  $('#loadInfo').textContent = `Lettura di ${pdfs.length} file…`;
  for (const file of pdfs) {
    try {
      const meta = await readMeta(PDFLib, new Uint8Array(await file.arrayBuffer()), CONFIG.metaKey);
      if (!meta || meta.app !== CONFIG.app) { other++; continue; }
      if (REC.some((r) => r.meta.ref === meta.ref && r.meta.created === meta.created)) { dup++; continue; }
      const t = meta.tags || {};
      REC.push({ meta, file, created: meta.created, code: meta.code, cat: meta.cat, who: t.alunno || t.persona || '', plesso: canonPlesso(t.plesso || ''),
        classe: canonClasse(t.classe || ''), as: meta.as || '', from: meta.from || '', firma: '' });
      REC[REC.length - 1].firma = firmaState(REC[REC.length - 1]);
      ok++;
    } catch (e) { other++; }
  }
  $('#loadInfo').textContent = `${ok} modul${ok === 1 ? 'o letto' : 'i letti'}` + (dup ? `, ${dup} già presenti` : '') + (other ? `, ${other} PDF non creati con questa pagina (ignorati)` : '') + '.';
  $('#arch').hidden = !REC.length;
  fillFilters(); renderArch();
}
function opt(sel, items, keep) {
  const v = keep ? sel.value : '';
  sel.innerHTML = '<option value="">Tutti</option>' + items.map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join('');
  if ([...sel.options].some((o) => o.value === v)) sel.value = v;
}
function uniq(key) { return [...new Set(REC.map((r) => r[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it', { numeric: true })); }
function fillFilters() {
  opt($('#fcat'), [...new Set(REC.map((r) => r.cat))].map((k) => [k, CATS[k] || k]), true);
  opt($('#fmod'), [...new Map(REC.map((r) => [r.meta.form, `${r.code} – ${r.meta.title}`]))].sort((a, b) => a[1].localeCompare(b[1], 'it', { numeric: true })), true);
  opt($('#fas'), uniq('as').map((x) => [x, x]), true);
  opt($('#fpl'), uniq('plesso').map((x) => [x, x]), true);
  opt($('#fcl'), uniq('classe').map((x) => [x, x]), true);
}
function filtered() {
  const q = norm($('#fq').value).split(/\s+/).filter(Boolean);
  const F = { cat: $('#fcat').value, form: $('#fmod').value, as: $('#fas').value, plesso: $('#fpl').value, classe: $('#fcl').value, firma: $('#ffirma').value, sens: $('#fsens').value };
  const dal = $('#fdal').value, al = $('#fal').value;
  const names = $('#showNames').checked;
  return REC.filter((r) => {
    if (F.cat && r.cat !== F.cat) return false;
    if (F.form && r.meta.form !== F.form) return false;
    if (F.as && r.as !== F.as) return false;
    if (F.plesso && r.plesso !== F.plesso) return false;
    if (F.classe && r.classe !== F.classe) return false;
    if (F.firma && r.firma !== F.firma) return false;
    if (F.sens && String(+!!r.meta.sens) !== F.sens) return false;
    const day = isoDay(new Date(r.created));
    if (dal && day < dal) return false;
    if (al && day > al) return false;
    if (q.length) {
      // con i nomi nascosti la ricerca non guarda nei dati personali dei campi
      const hay = norm([r.code, r.meta.title, r.plesso, r.classe, r.as, r.meta.ref, ...(names ? [r.who, r.from, ...(r.meta.data || []).map((d) => d.join(' '))] : [])].join(' '));
      if (!q.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}
function cell(r, k) {
  if (k === 'created') return new Date(r.created).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
  if (k === 'code') return `<b>${esc(r.code)}</b><br><span class="small">${esc(r.meta.title)}</span>`;
  if (k === 'cat') return esc(CATS[r.cat] || r.cat);
  if (k === 'who' || k === 'from') return esc(named(r[k]));
  if (k === 'firma') { const [l, c] = FIRMA_L[r.firma]; return `<span class="pill ${c}">${l}</span>`; }
  return esc(r[k]);
}
function renderArch() {
  const rows = filtered().sort((a, b) => String(a[sortKey]).localeCompare(String(b[sortKey]), 'it', { numeric: true }) * sortDir);
  $('#ahead').innerHTML = COLS.map(([k, l]) => `<th data-k="${k}"${k === sortKey ? ` aria-sort="${sortDir > 0 ? 'ascending' : 'descending'}"` : ''}>${l}</th>`).join('');
  $('#abody').innerHTML = rows.map((r) => `<tr data-i="${REC.indexOf(r)}" tabindex="0">${COLS.map(([k]) => `<td>${cell(r, k)}</td>`).join('')}</tr>`).join('')
    || `<tr><td colspan="${COLS.length}" class="small" style="text-align:center;padding:20px">Nessun modulo con questi filtri.</td></tr>`;
  $('#acount').textContent = `${rows.length} di ${REC.length} moduli`;
  const by = {};
  for (const r of rows) by[r.code] = (by[r.code] || 0) + 1;
  const firme = rows.filter((r) => r.firma !== 'ok').length;
  $('#stats').innerHTML = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `<span class="stat"><b>${n}</b>${esc(k)}</span>`).join('')
    + (firme ? `<span class="stat" style="color:var(--warn)"><b>${firme}</b>con firme da completare</span>` : '');
}
$('#filters').addEventListener('input', renderArch);
$('#showNames').addEventListener('change', renderArch);
$('#ahead').addEventListener('click', (e) => { const th = e.target.closest('th'); if (!th) return; const k = th.dataset.k; sortDir = sortKey === k ? -sortDir : 1; sortKey = k; renderArch(); });
$('#resetF').addEventListener('click', () => { $$('#filters input, #filters select').forEach((el) => { el.value = ''; }); renderArch(); });
$('#clearArch').addEventListener('click', () => { if (!confirm('Togliere tutti i moduli dall’elenco? I file sul computer non vengono toccati.')) return; REC = []; $('#arch').hidden = true; $('#loadInfo').textContent = ''; });
let detRec = null;
function openDet(r) {
  detRec = r;
  const m = r.meta;
  $('#detBody').innerHTML = `<p class="small">${esc(m.code)} · rif. ${esc(m.ref)} · ${new Date(m.created).toLocaleString('it-IT')}</p><h2>${esc(m.title)}</h2>
    ${m.sens ? '<p class="notice warn">Contiene dati personali che richiedono particolare tutela.</p>' : ''}
    <dl>${(m.data || []).map(([l, v]) => `<dt>${esc(l)}</dt><dd>${esc(v)}</dd>`).join('')}
    ${(m.sigs || []).map((s) => `<dt>Firma: ${esc(s.l)}</dt><dd>${{ dito: 'firmato col dito', digitale: 'da firmare digitalmente', mancante: 'mancante' }[s.how]}</dd>`).join('')}
    ${m.from ? `<dt>Inviato da</dt><dd>${esc(m.from)}</dd>` : ''}<dt>File</dt><dd>${esc(r.file.name)}</dd></dl>`;
  $('#dlgDet').showModal();
}
$('#abody').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-i]'); if (tr) openDet(REC[+tr.dataset.i]); });
$('#abody').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const tr = e.target.closest('tr[data-i]'); if (tr) openDet(REC[+tr.dataset.i]); } });
$('#detOpen').addEventListener('click', () => { if (!detRec) return; window.open(URL.createObjectURL(detRec.file), '_blank', 'noopener'); });
$('#csv').addEventListener('click', () => {
  const rows = filtered();
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const head = ['Compilato il', 'Codice', 'Modulo', 'Chi compila', 'Interessato', 'Plesso', 'Classe', 'A.S.', 'Firme', 'Inviato da', 'Riferimento', 'File'];
  const lines = rows.map((r) => [new Date(r.created).toLocaleString('it-IT'), r.code, r.meta.title, CATS[r.cat] || r.cat, named(r.who), r.plesso, r.classe, r.as,
    FIRMA_L[r.firma][0], named(r.from), r.meta.ref, r.file.name].map(q).join(';'));
  const blob = new Blob(['﻿' + [head.map(q).join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `moduli-ricevuti_${isoDay()}.csv`; a.click();
});
const drop = $('#drop');
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => loadFiles(e.dataTransfer.files));
$('#pickFiles').addEventListener('change', (e) => { loadFiles(e.target.files); e.target.value = ''; });
$('#pickDir').addEventListener('change', (e) => { loadFiles(e.target.files); e.target.value = ''; });

// ======================================================================== verbali composti (composti.js)
function compDefaults(m) {
  const C2 = CP[m.id];
  for (const f of C2.fields) {
    if (!f.k) continue;
    if (f.t === 'rows') V[f.k] = Array.from({ length: f.min || 0 }, () => ({}));
    else if (f.t === 'checks') V[f.k] = [];
    else if (f.def === 'today') V[f.k] = isoDay();
    else if (f.def != null) V[f.k] = f.def;
  }
}
function compControl(f, val, attrs) {
  const ph = f.ph ? ` placeholder="${esc(f.ph)}"` : '';
  if (f.t === 'textarea') return `<textarea ${attrs}${ph} rows="3">${esc(val || '')}</textarea>`;
  if (f.t === 'classe') {
    const [a, s] = (String(val || '').match(/^(\d\^?)\s*([A-Z]?)$/) || ['', '', '']).slice(1);
    return `<div class="duo"><select ${attrs} data-part="a" aria-label="Anno"><option value="">Anno</option>${LISTS['@ANNO'].opts.map((o) => `<option${o === a ? ' selected' : ''}>${o}</option>`).join('')}</select>
      <select ${attrs} data-part="s" aria-label="Sezione"><option value="">Sezione</option>${LISTS['@SEZ'].opts.map((o) => `<option${o === s ? ' selected' : ''}>${o}</option>`).join('')}</select></div>`;
  }
  if (f.t === 'select' || (f.opts && f.t === 'text')) {
    const L = list(f.opts);
    const strict = f.strict ?? L.strict;
    const inList = !val || L.opts.includes(val);
    const sel = `<select ${attrs} data-list="1"><option value=""></option>${L.opts.map((o) => `<option${o === val ? ' selected' : ''}>${esc(o)}</option>`).join('')}${strict ? '' : `<option value="__altro"${inList ? '' : ' selected'}>Altro…</option>`}</select>`;
    return strict ? sel : sel + `<input type="text" ${attrs} data-other="1" placeholder="Scrivi…" value="${inList ? '' : esc(val)}"${inList ? ' hidden' : ''}>`;
  }
  const type = { date: 'date', time: 'time' }[f.t] || 'text';
  return `<input type="${type}" ${attrs}${ph}${f.t === 'num' ? ' inputmode="numeric"' : ''} value="${esc(val || '')}">`;
}
function compField(f, i) {
  const C2 = CP[cur.id];
  if (f.sec) return `<div class="sec-h">${esc(f.sec)}</div>`;
  const hid = f.show && !f.show(V) ? ' hidden' : '';
  const sh = f.show ? ` data-cshow="${i}"` : '';
  if (f.t === 'check') return `<label class="chk"${sh}${hid}><input type="checkbox" data-k="${f.k}" ${V[f.k] ? 'checked' : ''}><span>${esc(f.l)}</span></label>`;
  if (f.t === 'checks') {
    const L = list(f.opts).opts;
    return `<div class="fld"${sh}${hid}><span class="lab">${esc(f.l)}</span><div class="mods" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:4px">${L.map((o) =>
      `<label class="chk" style="margin:0"><input type="checkbox" data-k="${f.k}" data-multi="1" value="${esc(o)}" ${(V[f.k] || []).includes(o) ? 'checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div></div>`;
  }
  if (f.t === 'rows') {
    const rows = V[f.k] || [];
    return `<div class="fld"${sh}${hid} data-rows="${f.k}"><span class="lab">${esc(f.l)}</span>${rows.map((r, ri) => `<div class="rowbox">
        <div class="rowbox-h"><b class="small">${ri + 1}.</b><button type="button" class="btn small danger" data-rowdel="${f.k}" data-ri="${ri}">Togli</button></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:4px 10px">${f.f.map((sf) => `<div class="fld" style="margin:2px 0${sf.t === 'textarea' ? ';grid-column:1/-1' : ''}"><label style="font-size:13px">${esc(sf.l)}</label>
          ${compControl(sf, r[sf.k], `data-rk="${f.k}" data-ri="${ri}" data-sk="${sf.k}" aria-label="${esc(sf.l)} ${ri + 1}"`)}</div>`).join('')}</div></div>`).join('')}
      <button type="button" class="btn small addrow" data-rowadd="${f.k}">+ ${esc(f.add || 'Aggiungi')}</button></div>`;
  }
  return `<div class="fld"${sh}${hid} data-wrap="${f.k}"><label class="${f.req ? 'req' : ''}">${esc(f.l)}</label>${compControl(f, V[f.k], `data-k="${f.k}"`)}
    ${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}<span class="msg" hidden></span></div>`;
}
function compRenderForm() {
  $('#form').innerHTML = `<div class="card"><p class="notice info" style="margin-top:12px">Il verbale viene scritto per intero dalla pagina con i dati che inserisci: l’anteprima a fianco è il documento vero. Le firme compaiono per ogni presente indicato.</p>${CP[cur.id].fields.map(compField).join('')}</div>`;
}
function compRead(el) {
  if (el.dataset.part) {
    const box = el.closest('.duo');
    const a = $('[data-part="a"]', box).value, s = $('[data-part="s"]', box).value;
    return a || s ? `${a}${s}` : '';
  }
  if (el.dataset.list) {
    const other = el.parentElement.querySelector('[data-other]');
    if (el.value === '__altro') { if (other) other.hidden = false; return other ? other.value : ''; }
    if (other) other.hidden = true;
    return el.value;
  }
  return el.value;
}
function compOnInput(e) {
  const el = e.target;
  if (el.dataset.k) {
    const k = el.dataset.k;
    if (el.dataset.multi) V[k] = $$(`input[data-k="${CSS.escape(k)}"][data-multi]`, $('#form')).filter((x) => x.checked).map((x) => x.value);
    else if (el.type === 'checkbox') V[k] = el.checked;
    else V[k] = compRead(el);
  } else if (el.dataset.rk) {
    const row = V[el.dataset.rk][+el.dataset.ri];
    row[el.dataset.sk] = compRead(el);
  } else return;
  compChanged();
}
function compChanged() {
  dirty = true; lastPdf = null;
  CP[cur.id].fields.forEach((f, i) => { if (f.show) { const el = $(`[data-cshow="${i}"]`, $('#form')); if (el) el.hidden = !f.show(V); } });
  const keys = SIGS().map((s) => s.key + s.l).join('|');
  if (keys !== padKeys) renderPads();
  compProgress(); compPreview();
}
function compClick(e) {
  const add = e.target.closest('[data-rowadd]'), del = e.target.closest('[data-rowdel]');
  if (!add && !del) return false;
  const k = (add || del).dataset.rowadd || (add || del).dataset.rowdel;
  if (add) V[k].push({}); else V[k].splice(+del.dataset.ri, 1);
  const i = CP[cur.id].fields.findIndex((f) => f.k === k);
  const box = $(`[data-rows="${CSS.escape(k)}"]`, $('#form'));
  const tmp = document.createElement('div'); tmp.innerHTML = compField(CP[cur.id].fields[i], i);
  box.replaceWith(tmp.firstElementChild);
  if (add) { const rs = $$(`[data-rk="${CSS.escape(k)}"]`, $('#form')); rs[rs.length - CP[cur.id].fields[i].f.length]?.focus(); }
  compChanged();
  return true;
}
function compErrors() {
  const errs = [];
  for (const f of CP[cur.id].fields) {
    if (!f.k || !f.req || (f.show && !f.show(V))) continue;
    const v = V[f.k];
    const w = $(`[data-wrap="${CSS.escape(f.k)}"]`, $('#form'));
    const bad = v == null || String(v).trim() === '';
    if (w) { w.classList.toggle('bad', bad); const m = $('.msg', w); if (m) { m.textContent = bad ? 'Campo obbligatorio' : ''; m.hidden = !bad; } }
    if (bad) errs.push([{ n: f.k, l: f.l }, 'Campo obbligatorio']);
  }
  const extra = CP[cur.id].check ? CP[cur.id].check(V) : '';
  if (extra) errs.push([{ n: 'verb', l: 'Controllo' }, extra]);
  return errs;
}
function compProgress() {
  const fs = CP[cur.id].fields.filter((f) => f.k && !(f.show && !f.show(V)));
  const has = (f) => { const v = V[f.k]; return Array.isArray(v) ? v.some((r) => (typeof r === 'string' ? r : Object.values(r).some((x) => String(x || '').trim()))) : v === true || (v != null && v !== false && String(v).trim() !== ''); };
  const sg = SIGS();
  const signed = sg.filter((s) => SG[s.key].png || SG[s.key].how === 'digitale').length;
  $('#progress').textContent = `${fs.filter(has).length} di ${fs.length} voci compilate` + (sg.length ? ` · firme ${signed}/${sg.length}` : '');
}
async function compBytes(extra) {
  const C2 = CP[cur.id];
  return composePdf(PDFLib, await template(cur.id), { head1: C2.head1, head2: C2.head2, top1: C2.top1, top2: C2.top2, blocks: C2.blocks(V, SG), ...extra });
}
let compTimer = null, compRun = 0;
function compPreview(now) {
  clearTimeout(compTimer);
  compTimer = setTimeout(async () => {
    const m = cur, run = ++compRun;
    try {
      const bytes = await compBytes({});
      const lib = await pdfjs();
      const doc = await lib.getDocument({ data: bytes }).promise;
      if (cur !== m || run !== compRun) return;
      const box = $('#pvPages');
      const frag = document.createDocumentFragment();
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const vp1 = page.getViewport({ scale: 1 });
        const scale = Math.min(2, Math.max(1.1, (box.clientWidth || 600) * (window.devicePixelRatio || 1) / vp1.width));
        const vp = page.getViewport({ scale });
        const div = document.createElement('div'); div.className = 'pv-page';
        const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
        div.appendChild(cv); frag.appendChild(div);
        await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        if (cur !== m || run !== compRun) return;
      }
      box.replaceChildren(frag);
      $('#pvInfo').textContent = `${doc.numPages} pagin${doc.numPages === 1 ? 'a' : 'e'} · si aggiorna mentre scrivi`;
    } catch (e) { console.error(e); }
  }, now ? 0 : 700);
}
function compMeta(ref, now, sender) {
  const C2 = CP[cur.id];
  const tags = {}, data = [];
  const show = (v) => (Array.isArray(v) ? v.join(', ') : v === true ? 'sì' : String(v ?? ''));
  for (const f of C2.fields) {
    if (!f.k || (f.show && !f.show(V))) continue;
    const v = V[f.k];
    if (f.t === 'rows') {
      (v || []).forEach((r, i) => { const t = f.f.map((sf) => r[sf.k] ? `${sf.l}: ${sf.t === 'date' ? itDate(r[sf.k]) : r[sf.k]}` : '').filter(Boolean).join(' · '); if (t) data.push([`${f.l} ${i + 1}`, t]); });
      continue;
    }
    if (v == null || v === '' || v === false || (Array.isArray(v) && !v.length)) continue;
    const s = f.t === 'date' ? itDate(v) : show(v);
    data.push([f.l, s]);
    if (f.tag && !tags[f.tag]) tags[f.tag] = s;
  }
  const sg = SIGS();
  return { v: 1, app: CONFIG.app, ref, form: cur.id, code: cur.code, title: cur.title, cat: cur.cat, sens: !!cur.sens, created: now.toISOString(),
    as: schoolYear(V.data ? new Date(V.data) : now), from: sender || '', tags, data,
    sigs: sg.map((s) => ({ l: s.l, how: SG[s.key].png ? 'dito' : SG[s.key].how === 'digitale' ? 'digitale' : 'mancante' })) };
}

// ======================================================================== avvio
for (const m of ORDER) for (const f of m.fields) if (f.alsoR == null && Array.isArray(f.alsoRects)) f.alsoR = f.alsoRects;
renderCats(); renderList();
function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h.startsWith('m=') && ALL[h.slice(2)]) { if (!cur || cur.id !== h.slice(2)) openForm(h.slice(2)); } else if (views[h]) show(h);
}
window.addEventListener('hashchange', route);
route();
