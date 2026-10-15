/* Dati dell'Istituto e liste delle tendine. Per aggiornarli: modificare questo file e rilanciare build_site.py. */
const CONFIG = {
  scuola: 'Istituto Comprensivo di Almese',
  luogo: 'Almese',
  // Casella Google Workspace della scuola che riceve i moduli e li archivia da sola su Drive
  // (script apps-script/Ricezione.gs). Quando c'è, è il destinatario proposto per primo.
  casellaModuli: 'moduli@comprensivoalmese.it',
  // Indirizzo pubblico della pagina (GitHub Pages): proposto a chi apre una copia della cartella con doppio clic
  sitoPubblico: 'https://comprensivoalmese.github.io/modulistica-ic-almese/',
  // Indirizzo dell'app web "Ricezione moduli" (script apps-script/Ricezione.gs): attiva il pulsante "Invia alla scuola"
  invioDiretto: 'https://script.google.com/macros/s/AKfycbx8_eQiDYSq3jCqoV5Yn3fzHO4VPwR0v84SilzxLneD1cLctThdgxp0wKo4e0ZP6gpZ/exec',
  // Indirizzo dell'app web "Archivio moduli" (apps-script/archivio): pulsante nella sezione "Moduli ricevuti"
  archivioScuola: 'https://script.google.com/a/macros/comprensivoalmese.it/s/AKfycbwOYXOEyx2zAcIJW-ZD1eFzU-YMIU3HZVIqEmCPnRfKDxdYBnMFn0xDgcsA5rsrSZ14/exec',
  // Destinatari proposti per l'invio: solo caselle istituzionali
  destinatari: [
    { l: 'Segreteria – toic82100c@istruzione.it', e: 'toic82100c@istruzione.it' },
    { l: 'Posta certificata – toic82100c@pec.istruzione.it', e: 'toic82100c@pec.istruzione.it' },
  ],
  // chiave dei dati strutturati dentro il PDF (la legge l'archivio)
  metaKey: 'ICAlmeseModulo',
  app: 'modulistica-ic-almese',
};

const AS_LIST = (() => {
  const d = new Date();
  const y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  return [y - 1, y, y + 1].map((a) => `${a}/${String(a + 1)}`);
})();

// liste usate dai campi con opts "@NOME". strict: solo voci dell'elenco (senza "Altro")
const LISTS = {
  '@PLESSI': { opts: ['Infanzia Rubiana', 'Infanzia Villar Dora', 'Primaria Almese', 'Primaria Milanere', 'Primaria Rivera',
    'Primaria Rubiana', 'Primaria Villar Dora', 'Secondaria di I grado'] },
  '@ORD': { opts: ['Infanzia', 'Primaria', 'Secondaria di I grado'] },
  '@COMUNI': { opts: ['Almese', 'Rubiana', 'Villar Dora'] },
  '@AS': { opts: AS_LIST },
  '@QUAL': { opts: ['docente', 'docente di sostegno', 'assistente amministrativo', 'assistente tecnico', 'collaboratore scolastico', 'DSGA', 'educatore'] },
  '@CONTR': { opts: ['indeterminato', 'determinato'], strict: true },
  '@SEZ': { opts: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] },
  '@ANNO': { opts: ['1^', '2^', '3^', '4^', '5^'] },
  '@MATERIE': { opts: ['Italiano', 'Storia', 'Geografia', 'Matematica', 'Scienze', 'Inglese', 'Francese', 'Spagnolo', 'Tecnologia',
    'Arte e immagine', 'Musica', 'Educazione fisica', 'Educazione civica', 'Religione cattolica', 'Attività alternativa', 'Sostegno'] },
  '@PROV': { opts: ['TO', 'AL', 'AT', 'BI', 'CN', 'NO', 'VB', 'VC', 'AO', 'EE (estero)',
    'AG', 'AN', 'AP', 'AQ', 'AR', 'AV', 'BA', 'BG', 'BL', 'BN', 'BO', 'BR', 'BS', 'BT', 'BZ', 'CA', 'CB', 'CE', 'CH', 'CL', 'CO', 'CR', 'CS',
    'CT', 'CZ', 'EN', 'FC', 'FE', 'FG', 'FI', 'FM', 'FR', 'GE', 'GO', 'GR', 'IM', 'IS', 'KR', 'LC', 'LE', 'LI', 'LO', 'LT', 'LU', 'MB', 'MC',
    'ME', 'MI', 'MN', 'MO', 'MS', 'MT', 'NA', 'NU', 'OR', 'PA', 'PC', 'PD', 'PE', 'PG', 'PI', 'PN', 'PO', 'PR', 'PT', 'PU', 'PV', 'PZ', 'RA',
    'RC', 'RE', 'RG', 'RI', 'RM', 'RN', 'RO', 'SA', 'SI', 'SO', 'SP', 'SR', 'SS', 'SU', 'SV', 'TA', 'TE', 'TN', 'TP', 'TR', 'TS', 'TV', 'UD',
    'VA', 'VE', 'VI', 'VR', 'VT', 'VV'], strict: true },
  '@SINO': { opts: ['sì', 'no'], strict: true },
  '@SESSO': { opts: ['Il sottoscritto', 'La sottoscritta'], strict: true },
  '@GENITORE': { opts: ['padre', 'madre', 'tutore', 'tutrice', 'affidatario', 'affidataria'] },
  '@MESI': { opts: ['settembre', 'ottobre', 'novembre', 'dicembre', 'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto'] },
  '@GIORNI': { opts: ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'] },
  '@VOTI': { opts: ['10', '9', '8', '7', '6', '5', '4', '3'] },
  '@GIUDIZI': { opts: ['Ottimo', 'Distinto', 'Buono', 'Discreto', 'Sufficiente', 'Non sufficiente'] },
};
