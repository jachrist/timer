// Rene funksjoner uten DOM – brukes av app.js og av testene.
// Tidspunkt lagres som lokal tid på formen "YYYY-MM-DDTHH:MM" (samme som <input type="datetime-local">),
// slik at de kan sorteres og sammenlignes som tekst.

export const pad = n => String(n).padStart(2, '0');

export const toLocal = d =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const parseLocal = s => new Date(s);

export function addDays(s, n) {
  const d = parseLocal(s);
  d.setDate(d.getDate() + n);
  return toLocal(d);
}

// --- Beregning ---

export function hours(e) {
  const h = (parseLocal(e.slutt) - parseLocal(e.start)) / 36e5;
  return h > 0 ? h : 0;
}
export const netto = e => hours(e) * (e.nettoSats || 0);
export const fakturert = e => hours(e) * (e.fakturertSats || 0);

export const summarize = list =>
  list.reduce(
    (s, e) => ({ timer: s.timer + hours(e), netto: s.netto + netto(e), fakturert: s.fakturert + fakturert(e) }),
    { timer: 0, netto: 0, fakturert: 0 }
  );

export const byStart = (a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0);

// Ny linje: kopi av forrige registrering (tekst, satser, klokkeslett og varighet), men på dagens dato.
export function draftFrom(prev, now = new Date()) {
  const dato = toLocal(now).slice(0, 10);
  if (!prev) return { start: `${dato}T08:00`, slutt: `${dato}T16:00`, beskrivelse: '', nettoSats: 0, fakturertSats: 0 };
  const start = dato + prev.start.slice(10);
  const slutt = toLocal(new Date(parseLocal(start).getTime() + (parseLocal(prev.slutt) - parseLocal(prev.start))));
  return { start, slutt, beskrivelse: prev.beskrivelse, nettoSats: prev.nettoSats, fakturertSats: prev.fakturertSats };
}

// --- Perioder (uke = ISO-uke, mandag–søndag) ---

export function periodRange(type, ref) {
  const y = ref.getFullYear(), m = ref.getMonth(), d = ref.getDate();
  let from, to;
  if (type === 'uke') {
    from = new Date(y, m, d - ((ref.getDay() + 6) % 7));
    to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7);
  } else if (type === 'maned') {
    from = new Date(y, m, 1);
    to = new Date(y, m + 1, 1);
  } else {
    from = new Date(y, 0, 1);
    to = new Date(y + 1, 0, 1);
  }
  return { from: toLocal(from), to: toLocal(to) };
}

export const inRange = (e, r) => e.start >= r.from && e.start < r.to;

export function shiftRef(type, ref, n) {
  if (type === 'uke') return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + 7 * n);
  if (type === 'maned') return new Date(ref.getFullYear(), ref.getMonth() + n, 1);
  return new Date(ref.getFullYear() + n, 0, 1);
}

export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const year = d.getUTCFullYear();
  return { year, week: Math.ceil(((d - Date.UTC(year, 0, 1)) / 864e5 + 1) / 7) };
}

const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const DAYS = ['sø', 'ma', 'ti', 'on', 'to', 'fr', 'lø'];

export function periodLabel(type, ref) {
  if (type === 'uke') {
    const { year, week } = isoWeek(ref);
    return `Uke ${week} ${year}`;
  }
  if (type === 'maned') return `${MONTHS[ref.getMonth()]} ${ref.getFullYear()}`;
  return String(ref.getFullYear());
}

// --- Formatering ---

export const fmtNum = (x, dec = 2) =>
  x.toLocaleString('nb-NO', { minimumFractionDigits: dec, maximumFractionDigits: dec });
export const fmtKr = x => `${fmtNum(x, 0)} kr`;
export const fmtDate = s => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
export const fmtTime = s => s.slice(11, 16);
export const fmtDay = s => `${DAYS[parseLocal(s).getDay()]} ${fmtDate(s)}`;
export const fmtSpan = e =>
  `${fmtTime(e.start)}–${e.slutt.slice(0, 10) === e.start.slice(0, 10) ? '' : fmtDate(e.slutt).slice(0, 5) + ' '}${fmtTime(e.slutt)}`;

// Tabulatorseparert tekst limes rett inn i Excel, e-post o.l. Tall uten tusenskille.
const plain = x => x.toFixed(2).replace('.', ',');
export const TSV_HEADER = ['Dato', 'Start', 'Slutt', 'Beskrivelse', 'Timer', 'Netto kr'].join('\t');
export const toTsvRow = e =>
  [fmtDate(e.start), fmtTime(e.start), fmtTime(e.slutt), e.beskrivelse.replace(/\s*[\t\r\n]+\s*/g, ' '), plain(hours(e)), plain(netto(e))].join('\t');
export function toTsvPeriod(list) {
  const s = summarize(list);
  return [TSV_HEADER, ...list.map(toTsvRow), ['Sum', '', '', '', plain(s.timer), plain(s.netto)].join('\t')].join('\n');
}

// --- Excel ---

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

// "YYYY-MM-DDTHH:MM" -> Excel-serienummer (dager, brøkdel = klokkeslett)
export function toSerial(s) {
  const [y, mo, d, h, mi] = s.match(/\d+/g).map(Number);
  return (Date.UTC(y, mo - 1, d, h, mi) - EXCEL_EPOCH) / 864e5;
}

// Tolker en celle som dato og/eller klokkeslett. Returnerer { dato?: "YYYY-MM-DD", tid?: "HH:MM" }.
export function cellParts(v) {
  if (typeof v === 'number') {
    const min = Math.round(v * 1440);
    const days = Math.floor(min / 1440), m = min % 1440;
    const tid = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
    if (days === 0) return { tid };
    return { dato: new Date(EXCEL_EPOCH + days * 864e5).toISOString().slice(0, 10), tid };
  }
  if (v instanceof Date) return { dato: toLocal(v).slice(0, 10), tid: toLocal(v).slice(11) };
  let s = String(v ?? '').trim();
  const out = {};
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) out.dato = `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  else if ((m = s.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/))) {
    out.dato = `${m[3].length === 2 ? '20' + m[3] : m[3]}-${pad(m[2])}-${pad(m[1])}`;
  }
  if (m) s = s.replace(m[0], '');
  const t = s.match(/(\d{1,2})[:.](\d{2})(?!\d)/);
  if (t) out.tid = `${pad(t[1])}:${t[2]}`;
  return out;
}

export const FIELDS = {
  dato: 'Dato',
  start: 'Start',
  slutt: 'Slutt',
  beskrivelse: 'Beskrivelse',
  nettoSats: 'Netto timepris',
  fakturertSats: 'Fakturert timepris',
};
// Rekkefølgen avgjør ved overlapp ("Fakturert timepris" skal ikke bli netto).
const PATTERNS = [
  ['fakturertSats', /faktur/],
  ['nettoSats', /netto|sats|timepris/],
  ['dato', /^dato|^dag|date/],
  ['start', /start|^fra|^inn|begin/],
  ['slutt', /slutt|^til|^ut\b|stopp|end/],
  ['beskrivelse', /beskriv|tekst|arbeid|aktivitet|oppgave|kommentar|desc|note/],
];

// Finner overskriftsraden (blant de 10 første) og gjetter hvilke kolonner som er hva.
export function guessMapping(rows) {
  const match = row => {
    const map = {};
    (row ?? []).forEach((cell, i) => {
      if (typeof cell !== 'string') return;
      const h = cell.trim().toLowerCase();
      const hit = PATTERNS.find(([k, re]) => re.test(h) && !(k in map));
      if (hit) map[hit[0]] = i;
    });
    return map;
  };
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const map = match(rows[i]);
    if (Object.keys(map).length >= 2) return { header: i, map };
  }
  return { header: -1, map: {} };
}

// Gjør rader om til registreringer. map: felt -> kolonneindeks. Rader som ikke kan tolkes telles som hoppet over.
export function rowsToEntries(rows, map, defaults = {}) {
  const entries = [];
  let skipped = 0;
  for (const row of rows) {
    const get = k => (map[k] >= 0 ? row[map[k]] : undefined);
    const s = cellParts(get('start')), sl = cellParts(get('slutt')), d = cellParts(get('dato'));
    const dato = d.dato || s.dato;
    if (!dato || !s.tid || !sl.tid) {
      if (row.some(c => c != null && c !== '')) skipped++;
      continue;
    }
    const start = `${dato}T${s.tid}`;
    let slutt = `${sl.dato || dato}T${sl.tid}`;
    if (slutt <= start) slutt = addDays(slutt, 1); // over midnatt
    const num = (k, def) => {
      const v = get(k);
      const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[\s kr]/g, '').replace(',', '.'));
      return Number.isFinite(n) ? n : def || 0;
    };
    entries.push({
      start,
      slutt,
      beskrivelse: String(get('beskrivelse') ?? '').trim(),
      nettoSats: num('nettoSats', defaults.nettoSats),
      fakturertSats: num('fakturertSats', defaults.fakturertSats),
    });
  }
  return { entries, skipped };
}

export const entryKey = e => `${e.start}|${e.slutt}|${e.beskrivelse}`;
