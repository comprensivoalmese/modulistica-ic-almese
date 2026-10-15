/* Modelli "composti": verbali che nell'originale sono una traccia da completare a mano.
   La pagina raccoglie i dati in un modulo strutturato e scrive il verbale per intero, con l'intestazione del modello.
   Ogni modello: head (zone dell'intestazione da riusare), fields, signers(V), blocks(V, sig), tags(V). */
'use strict';

const DS_NOME = 'Giovanni Coppola';
const dIT = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v.split('-').reverse().join('/') : v || '');
const tIT = (v) => String(v || '').replace(':', '.');
const blank = (v, n = 10) => (v && String(v).trim() ? String(v).trim() : '…'.repeat(n));
const B = (t) => [t, 'b'];
const filled = (rows, k) => (rows || []).filter((r) => r && String(r[k] || '').trim());
const joinIt = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1]);

// ------------------------------------------------------------------------------------------- verbale di colloquio
function verbaleColloquio({ ds, convDef }) {
  return {
    fields: [
      { sec: 'Il colloquio' },
      { k: 'data', l: 'Data', t: 'date', req: true, def: 'today' },
      { k: 'ora', l: 'Ora', t: 'time', req: true },
      { k: 'ordine', l: 'Scuola', t: 'select', opts: '@ORD', strict: true, req: true },
      { k: 'plesso', l: 'Plesso', t: 'select', opts: '@PLESSI', req: true, tag: 'plesso' },
      { k: 'comune', l: 'Comune', t: 'select', opts: '@COMUNI' },
      { k: 'alunno', l: 'Alunno/a (cognome e nome)', t: 'text', req: true, tag: 'alunno' },
      { k: 'classe', l: 'Classe', t: 'classe', req: true, tag: 'classe' },
      { k: 'conv', l: 'Convocazione da parte', t: 'select', strict: true, def: convDef,
        opts: ['del coordinatore della classe', 'della coordinatrice della classe', 'del team docenti della classe', 'del Dirigente Scolastico', 'dei genitori, su loro richiesta'] },
      { sec: 'Presenti' },
      { k: 'ins', l: 'Insegnanti presenti', t: 'rows', min: 1, add: 'Aggiungi insegnante', f: [{ k: 'nome', l: 'Cognome e nome', t: 'text' }, { k: 'mat', l: 'Materia o ruolo', t: 'text', opts: '@MATERIE' }] },
      { k: 'gen', l: 'Genitori o tutori presenti', t: 'rows', min: 1, add: 'Aggiungi genitore', f: [{ k: 'nome', l: 'Cognome e nome', t: 'text' }, { k: 'ruolo', l: 'In qualità di', t: 'select', opts: '@GENITORE' }] },
      ...(ds ? [{ k: 'dsPres', l: 'È presente il Dirigente Scolastico', t: 'check', def: true }] : []),
      { k: 'altri', l: 'Altri presenti (facoltativo)', t: 'text', ph: 'es. educatore, mediatore culturale, specialista' },
      { sec: 'Introduzione' },
      { k: 'coord', l: 'Chi riepiloga i fatti (coordinatore/coordinatrice)', t: 'text' },
      { k: 'pres', l: 'Giorni di presenza', t: 'num', hint: 'Lascia vuoto se la frequenza non è un tema del colloquio.' },
      { k: 'tot', l: 'su giorni di attività didattica', t: 'num' },
      { k: 'mat', l: 'Materie in cui il profitto è carente', t: 'checks', opts: '@MATERIE' },
      { k: 'fatti', l: 'Fatti e contatti precedenti', t: 'rows', add: 'Aggiungi un fatto', f: [
        { k: 'data', l: 'Data', t: 'date' }, { k: 'ora', l: 'Ora', t: 'time' },
        { k: 'testo', l: 'Che cosa è successo', t: 'textarea', ph: 'es. l’insegnante ha contattato telefonicamente la famiglia e ha riferito che…' }] },
      { k: 'atti', l: 'Documenti agli atti della scuola', t: 'select', strict: true, opts: ['risultano', 'non risultano'] },
      { k: 'attiSu', l: 'Documenti relativi a', t: 'text', show: (V) => !!V.atti },
      { k: 'attiPres', l: 'Agli atti della scuola sono presenti (facoltativo)', t: 'text' },
      { sec: 'Interventi' },
      { k: 'int', l: 'Prendono la parola', t: 'rows', min: 1, add: 'Aggiungi intervento', f: [
        { k: 'chi', l: 'Chi', t: 'select', strict: true, opts: ['l’insegnante', 'la sig.ra', 'il sig.', 'il Dirigente Scolastico', 'l’educatore/educatrice', 'lo/la specialista'] },
        { k: 'nome', l: 'Nome', t: 'text' },
        { k: 'verbo', l: 'che', t: 'select', strict: true, opts: ['afferma', 'dichiara', 'riferisce', 'suggerisce', 'propone', 'chiede'] },
        { k: 'testo', l: 'Contenuto', t: 'textarea' }] },
      { sec: 'Conclusioni' },
      { k: 'acc', l: 'Dopo ampia discussione si conviene che', t: 'rows', min: 1, add: 'Aggiungi un impegno', f: [
        { k: 'chi', l: 'Chi', t: 'select', strict: true, opts: ['i genitori', 'gli/le insegnanti', 'il Dirigente Scolastico', 'la scuola', 'l’alunno/a'] },
        { k: 'testo', l: 'Si impegna a / concorda che', t: 'textarea' }] },
      { k: 'prec', l: 'Con la precisazione che (facoltativo)', t: 'textarea' },
    ],
    signers(V) {
      const s = [];
      filled(V.gen, 'nome').forEach((g, i) => s.push({ key: 'g' + i, l: `Genitore: ${g.nome}`, who: 'gen', name: g.nome }));
      filled(V.ins, 'nome').forEach((g, i) => s.push({ key: 'i' + i, l: `Insegnante: ${g.nome}`, who: 'ins', name: g.nome }));
      if (ds) s.push({ key: 'ds', l: 'Il Dirigente Scolastico', name: DS_NOME, digital: true, opt: !V.dsPres });
      return s;
    },
    blocks(V, S) {
      const ins = filled(V.ins, 'nome'), gen = filled(V.gen, 'nome');
      const b = [{ t: 'h', text: 'Verbale di COLLOQUIO', size: 13 }];
      b.push({ t: 'p', r: [`In data ${blank(dIT(V.data))} alle ore ${blank(tIT(V.ora), 5)} presso la ${blank(V.ordine && (V.ordine.startsWith('Sec') ? 'Scuola Secondaria di I grado' : 'Scuola ' + V.ordine))}, plesso “${blank(V.plesso)}” di ${blank(V.comune)}, su convocazione dei genitori dell’alunno/a `, B(blank(V.alunno, 20)), ` da parte ${blank(V.conv, 14)} ${V.conv && V.conv.includes('classe') ? '' : 'per la classe '}${blank(V.classe, 4)}, si svolge il colloquio scuola - famiglia; sono presenti:`] });
      const pres = [];
      pres.push(`insegnanti: ${ins.length ? ins.map((x) => x.nome + (x.mat ? ` (${x.mat})` : '')).join(', ') : blank('')}`);
      pres.push(`i genitori: ${gen.length ? gen.map((x) => x.nome + (x.ruolo ? ` (${x.ruolo})` : '')).join(', ') : blank('')}`);
      if (ds && V.dsPres) pres.push(`il Dirigente Scolastico, ${DS_NOME}`);
      if (V.altri) pres.push(`altri presenti: ${V.altri}`);
      b.push({ t: 'li', items: pres });
      b.push({ t: 'sub', text: 'INTRODUZIONE:' });
      b.push({ t: 'p', r: `Il/la coordinatore/rice di classe ${blank(V.coord, 14)} riepiloga i fatti che hanno portato alla convocazione dei genitori:` });
      const intro = [];
      if (V.pres) intro.push(`ad oggi la frequenza dell’alunno/a è pari a nr. ${V.pres} giorni di presenza su nr. ${blank(V.tot, 4)} giorni di attività didattica;`);
      if ((V.mat || []).length) intro.push(`il profitto dell’alunno/a è carente rispetto ai nuclei fondamentali delle materie: ${V.mat.join(', ')}, per cui è a rischio il successo formativo;`);
      for (const f of filled(V.fatti, 'testo')) intro.push(`${f.data ? `in data ${dIT(f.data)}` : ''}${f.ora ? `, alle ore ${tIT(f.ora)}` : ''}${f.data || f.ora ? ', ' : ''}${f.testo.trim()}`);
      if (V.atti) intro.push(`agli atti della scuola ${V.atti} documenti${V.attiSu ? ' relativi a ' + V.attiSu : ''};`);
      if (V.attiPres) intro.push(`agli atti della scuola sono presenti: ${V.attiPres}`);
      if (intro.length) b.push({ t: 'li', items: intro });
      b.push({ t: 'sub', text: 'INTERVENTI:' });
      b.push({ t: 'p', r: 'Prendono la parola:' });
      const it = filled(V.int, 'testo').map((x) => [[`${x.chi || ''} ${x.nome || ''}`.trim() + ', che ', 'r'], [`${x.verbo || 'afferma'}`, 'i'], [`: ${x.testo.trim()}`, 'r']]);
      b.push({ t: 'li', items: it.length ? it : [blank('', 40)] });
      b.push({ t: 'p', r: 'Dopo ampia discussione si conviene che:' });
      const acc = filled(V.acc, 'testo').map((x) => `${x.chi || ''} ${x.testo.trim()}`.trim());
      b.push({ t: 'li', items: acc.length ? acc : [blank('', 40)] });
      if (V.prec) b.push({ t: 'p', r: `con la precisazione che ${V.prec.trim()}` });
      b.push({ t: 'space', h: 10 });
      b.push({ t: 'p', r: 'Letto e sottoscritto da' });
      const sg = (who) => this.signers(V).filter((s) => s.who === who).map((s) => ({ l: '', name: s.name, png: S[s.key]?.png }));
      const g = sg('gen'), i = sg('ins');
      const items = [];
      for (let k = 0; k < Math.max(g.length, i.length, 1); k++) {
        items.push(g[k] ? { ...g[k], l: k ? '' : 'Genitori' } : { l: k ? '' : 'Genitori' });
        items.push(i[k] ? { ...i[k], l: k ? '' : 'Insegnanti' } : { l: k ? '' : 'Insegnanti' });
      }
      b.push({ t: 'sig', items, cols: 2 });
      if (ds) b.push({ t: 'sig', items: [{ l: 'IL DIRIGENTE SCOLASTICO', name: DS_NOME, png: S.ds?.png, digital: S.ds?.how === 'digitale' }], cols: 1 });
      return b;
    },
  };
}

// ------------------------------------------------------------------------------------------- verbale organi collegiali
const ORGANI = ['Consiglio di Classe', 'Consiglio di Interclasse', 'Consiglio di Intersezione', 'Team docenti', 'Collegio dei docenti di plesso',
  'Dipartimento disciplinare', 'Gruppo di lavoro', 'Commissione'];
const CARTELLE = ['[I_01] Verbali scuole dell’infanzia', '[I_02] Verbali di Sezione-Intersezione', '[P_01] Verbali di plesso e di scuola primaria',
  '[P_02] Verbali di Classe-Interclasse', '[S_01] Verbali Plesso - Dipartimenti - Materie', '[S_02] Verbali CdC'];
const verbaleOOCC = {
  fields: [
    { sec: 'La seduta' },
    { k: 'num', l: 'Verbale n.', t: 'num', req: true },
    { k: 'organo', l: 'Organo collegiale', t: 'select', opts: ORGANI, req: true },
    { k: 'classe', l: 'Classe / sezione (se riguarda una classe)', t: 'text', ph: 'es. 2^B', tag: 'classe' },
    { k: 'ordine', l: 'Scuola', t: 'select', opts: '@ORD', strict: true, req: true },
    { k: 'plesso', l: 'Plesso', t: 'select', opts: '@PLESSI', req: true, tag: 'plesso' },
    { k: 'data', l: 'Il giorno', t: 'date', req: true, def: 'today' },
    { k: 'ora', l: 'Alle ore', t: 'time', req: true },
    { k: 'sede', l: 'Presso la sede / plesso', t: 'text', ph: 'es. plesso di Almese, aula 3 – oppure: in videoconferenza (Meet)' },
    { k: 'odg', l: 'Ordine del giorno', t: 'rows', min: 1, add: 'Aggiungi un punto', f: [{ k: 'arg', l: 'Argomento', t: 'text' }] },
    { sec: 'Presenti e assenti' },
    { k: 'pres', l: 'Componenti', t: 'rows', min: 3, add: 'Aggiungi componente', f: [
      { k: 'nome', l: 'Docente / componente', t: 'text' }, { k: 'pa', l: 'Pres./Ass.', t: 'select', strict: true, opts: ['P', 'A', 'A giust.'] }, { k: 'note', l: 'Note', t: 'text', ph: 'es. sostituito da…' }] },
    { k: 'presiede', l: 'Presiede', t: 'select', strict: true, opts: ['il Dirigente Scolastico', 'il delegato del Dirigente Scolastico'], def: 'il delegato del Dirigente Scolastico' },
    { k: 'pres_nome', l: 'Nome del presidente', t: 'text', req: true, def: DS_NOME, tag: 'persona' },
    { k: 'verb', l: 'Verbalizza', t: 'text', req: true, hint: 'Verbalizzatore e presidente non possono essere la stessa persona.' },
    { sec: 'Discussione dei punti' },
    { k: 'punti', l: 'Punti all’ordine del giorno', t: 'rows', min: 1, add: 'Aggiungi un punto discusso', f: [
      { k: 'tit', l: 'Argomento', t: 'text' },
      { k: 'intro', l: 'Introduzione a cura di', t: 'text' },
      { k: 'disc', l: 'Discussione', t: 'textarea' },
      { k: 'int', l: 'Interventi', t: 'textarea', ph: 'Lascia vuoto per “nessun intervento”' },
      { k: 'prop', l: 'Proposta di delibera (se si delibera)', t: 'textarea' },
      { k: 'esito', l: 'Esito della delibera', t: 'select', strict: true, opts: ['all’unanimità', 'a maggioranza'] },
      { k: 'fav', l: 'Favorevoli', t: 'num' }, { k: 'con', l: 'Contrari', t: 'num' }, { k: 'ast', l: 'Astenuti', t: 'num' },
      { k: 'appr', l: 'Si delibera di approvare', t: 'textarea' }] },
    { sec: 'Chiusura' },
    { k: 'fine', l: 'La seduta', t: 'select', strict: true, opts: ['è tolta (nulla più da dibattere)', 'si aggiorna (discussione non conclusa)'], def: 'è tolta (nulla più da dibattere)' },
    { k: 'oraFine', l: 'Alle ore', t: 'time', req: true },
    { k: 'aggiorna', l: 'La seduta si aggiorna al', t: 'date', show: (V) => (V.fine || '').startsWith('si aggiorna') },
    { k: 'cart', l: 'Cartella di archiviazione (Drive condivisi)', t: 'select', strict: true, opts: CARTELLE },
  ],
  signers(V) {
    return [{ key: 'verb', l: 'Il Verbalizzatore', name: V.verb || '' }, { key: 'pres', l: 'Il Presidente', name: V.pres_nome || '' }];
  },
  check(V) {
    if (V.verb && V.pres_nome && V.verb.trim().toLowerCase() === V.pres_nome.trim().toLowerCase()) return 'Verbalizzatore e presidente non possono essere la stessa persona.';
    return '';
  },
  blocks(V, S) {
    const comp = filled(V.pres, 'nome');
    const np = comp.filter((c) => (c.pa || 'P') === 'P').length;
    const b = [{ t: 'h', text: `VERBALE n. ${blank(V.num, 3)}`, size: 13, before: 0 }];
    b.push({ t: 'p', align: 'center', r: [B(`${blank(V.organo, 14)}${V.classe ? ' ' + V.classe : ''} – Plesso ${blank(V.plesso)} – ${V.ordine ? ORDINE_IT(V.ordine) : blank('')}`)], gap: 10 });
    const fem = /^Commissione/.test(V.organo || '');
    const art = V.organo ? (fem ? 'la' : 'il') : 'il/la';
    b.push({ t: 'p', r: `Il giorno ${blank(dIT(V.data))} alle ore ${blank(tIT(V.ora), 5)} presso ${blank(V.sede, 14)} si è riunit${V.organo ? (fem ? 'a' : 'o') : 'o/a'} ${art} ${blank(V.organo, 14)}${V.classe ? ' ' + V.classe : ''} per discutere e deliberare sui seguenti argomenti:` });
    const odg = filled(V.odg, 'arg').map((x) => x.arg);
    b.push({ t: 'li', num: true, items: odg.length ? odg : [blank('', 30)] });
    b.push({ t: 'sub', text: 'Presenti / Assenti' });
    b.push({ t: 'table', cols: [{ l: 'Docente / componente', w: 0.5 }, { l: 'Pres./Ass.', w: 0.15 }, { l: 'Note', w: 0.35 }],
      rows: comp.length ? comp.map((c) => [c.nome, c.pa || 'P', c.note || '']) : [['', '', ''], ['', '', '']] });
    b.push({ t: 'p', r: `Componenti nr. ${comp.length || blank('', 3)}   Presenti ${comp.length ? np : blank('', 3)}   Assenti ${comp.length ? comp.length - np : blank('', 3)}` });
    b.push({ t: 'p', r: `Presiede ${V.presiede || 'il delegato del Dirigente Scolastico'}${V.pres_nome ? ', ' + V.pres_nome : ''}. Verbalizza ${blank(V.verb, 16)}.` });
    b.push({ t: 'p', r: 'Considerata la presenza del numero legale, il presidente avvia la riunione.' });
    let nDel = 0;
    filled(V.punti, 'tit').forEach((p, i) => {
      b.push({ t: 'sub', text: `${i + 1}. ${p.tit}` });
      if (p.intro) b.push({ t: 'p', r: [B('Introduzione '), `a cura di ${p.intro}`] });
      if (p.disc) b.push({ t: 'p', r: [B('Discussione: '), p.disc.trim()] });
      b.push({ t: 'p', r: [B('Interventi: '), p.int && p.int.trim() ? p.int.trim() : 'NESSUN INTERVENTO'] });
      if (p.prop || p.appr) {
        nDel++;
        if (p.prop) b.push({ t: 'p', r: [B('Proposta di delibera: '), p.prop.trim()] });
        b.push({ t: 'p', r: 'Tanto premesso e dibattuto si procede alla delibera.' });
        b.push({ t: 'p', align: 'center', r: [B(`Delibera n. ${nDel}`)], gap: 2 });
        b.push({ t: 'p', align: 'center', r: `${art} ${blank(V.organo, 14)}, PRESO ATTO della presenza della maggioranza dei componenti,`, gap: 2 });
        b.push({ t: 'p', align: 'center', r: [B('DELIBERA')], gap: 2 });
        const voti = p.esito === 'a maggioranza' ? ` (favorevoli ${blank(p.fav, 2)}, contrari ${blank(p.con, 2)}, astenuti ${blank(p.ast, 2)})` : '';
        b.push({ t: 'p', align: 'center', r: `${p.esito || 'all’unanimità'}${voti}`, gap: 4 });
        b.push({ t: 'p', r: [`di approvare ${p.appr ? p.appr.trim() : blank('', 30)}`] });
      }
    });
    b.push({ t: 'space', h: 6 });
    b.push({ t: 'p', r: (V.fine || '').startsWith('si aggiorna')
      ? `Alle ore ${blank(tIT(V.oraFine), 5)}, non avendo concluso la discussione dei punti all’ordine del giorno, la seduta si aggiorna al ${blank(dIT(V.aggiorna))}.`
      : `Alle ore ${blank(tIT(V.oraFine), 5)}, nulla più essendovi da dibattere, la seduta è tolta.` });
    b.push({ t: 'sig', cols: 2, items: [{ l: 'Il Verbalizzatore', name: V.verb, png: S.verb?.png }, { l: 'Il Presidente', name: V.pres_nome, png: S.pres?.png }] });
    b.push({ t: 'p', size: 9, r: `Il presente verbale è archiviato, in formato .pdf, nella cartella dei Drive condivisi ${V.cart || blank('', 20)}.` });
    return b;
  },
};
const ORDINE_IT = (o) => ({ Infanzia: 'Scuola dell’Infanzia', Primaria: 'Scuola Primaria', 'Secondaria di I grado': 'Scuola Secondaria di I grado' }[o] || o);

const COMPOSTI = {
  ds003: { head1: { p: 0, clip: [55, 80, 560, 300] }, head2: { p: 0, clip: [55, 80, 560, 130] }, top1: 312, top2: 142, ...verbaleColloquio({ ds: true, convDef: 'del coordinatore della classe' }) },
  ds004: { head1: { p: 0, clip: [55, 80, 560, 300] }, head2: { p: 0, clip: [55, 80, 560, 130] }, top1: 312, top2: 142, ...verbaleColloquio({ ds: true, convDef: 'del Dirigente Scolastico' }) },
  doc004: { head1: { p: 0, clip: [55, 58, 560, 108] }, head2: { p: 0, clip: [55, 58, 560, 108] }, top1: 122, top2: 122, ...verbaleColloquio({ ds: false, convDef: 'del coordinatore della classe' }) },
  doc001: { head1: { p: 0, clip: [52, 50, 548, 90] }, head2: { p: 0, clip: [52, 50, 548, 90] }, top1: 104, top2: 104, ...verbaleOOCC },
};
if (typeof module !== 'undefined') module.exports = { COMPOSTI };
