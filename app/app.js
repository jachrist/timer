import * as L from './lib.js';

const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
const $ = s => document.querySelector(s);

const state = {
  entries: [], // sortert stigende på start
  editing: null, // id for raden som redigeres, eller 'ny'
  draft: null,
  type: load('ptype') || 'maned',
  ref: new Date(),
};

function load(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function save(k, v) {
  try { localStorage.setItem(k, v); } catch { /* ikke kritisk */ }
}

// --- API ---

async function api(method, path, body) {
  const res = await fetch('/api/' + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body && JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.json().then(b => b.feil, () => null);
    throw new Error(msg || `Feil fra server (${res.status})`);
  }
  if (res.status === 204) return null;
  if (!res.headers.get('content-type')?.includes('json')) throw new Error('Du er logget ut – last siden på nytt');
  return res.json();
}

async function put(list) {
  for (let i = 0; i < list.length; i += 500) await api('PUT', 'entries', list.slice(i, i + 500));
  const byId = new Map(state.entries.map(e => [e.id, e]));
  for (const e of list) byId.set(e.id, e);
  state.entries = [...byId.values()].sort(L.byStart);
}

// --- Hjelpere ---

function el(tag, props = {}, ...kids) {
  const { data, ...rest } = props;
  const n = Object.assign(document.createElement(tag), rest);
  if (data) Object.assign(n.dataset, data);
  n.append(...kids);
  return n;
}
const button = (label, act, title = '') => el('button', { type: 'button', title, data: { act } }, label);
const field = (label, input, className = '') => el('label', { className }, label, input);

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Kopiert');
  } catch {
    toast('Kunne ikke kopiere');
  }
}

const range = () => L.periodRange(state.type, state.ref);

// --- Visning ---

function renderSummary() {
  const r = range();
  $('#ptype').value = state.type;
  $('#plabel').textContent = L.periodLabel(state.type, state.ref);
  const sum = L.summarize(state.entries.filter(e => L.inRange(e, r)));
  $('#sTimer').textContent = L.fmtNum(sum.timer);
  $('#sNetto').textContent = L.fmtKr(sum.netto);
  $('#sFakt').textContent = L.fmtKr(sum.fakturert);
}

function viewRow(e, current) {
  return el('div', { className: 'row' + (current ? ' cur' : ''), data: { id: e.id } },
    el('div', { className: 'when' }, el('b', {}, L.fmtDay(e.start)), el('span', {}, L.fmtSpan(e))),
    el('div', { className: 'text' }, e.beskrivelse),
    el('div', { className: 'num' }, `${L.fmtNum(L.hours(e))} t`),
    el('div', { className: 'num' }, L.fmtKr(L.netto(e))),
    el('div', { className: 'act' }, button('⧉', 'copy', 'Kopier linjen'), button('✎', 'edit', 'Rediger')));
}

function editRow(e) {
  const form = el('form', { className: 'row edit', data: { id: e.id ?? 'ny' } },
    field('Start', el('input', { name: 'start', type: 'datetime-local', required: true, value: e.start })),
    field('Slutt', el('input', { name: 'slutt', type: 'datetime-local', required: true, value: e.slutt })),
    field('Netto timepris', el('input', { name: 'nettoSats', type: 'number', min: 0, step: 'any', value: e.nettoSats })),
    field('Fakturert timepris', el('input', { name: 'fakturertSats', type: 'number', min: 0, step: 'any', value: e.fakturertSats })),
    field('Beskrivelse', el('textarea', { name: 'beskrivelse', rows: 2, value: e.beskrivelse }), 'wide'),
    el('div', { className: 'calc' }),
    el('div', { className: 'act' },
      el('button', { type: 'submit', className: 'primary' }, 'Lagre'),
      button('Avbryt', 'cancel'),
      ...(e.id ? [button('Slett', 'delete')] : [])));
  updateCalc(form);
  return form;
}

function renderList() {
  const r = range();
  const rows = state.entries.map(e => (e.id === state.editing ? editRow(e) : viewRow(e, L.inRange(e, r))));
  if (state.editing === 'ny') rows.push(editRow(state.draft));
  $('#list').replaceChildren(...rows);
  $('#empty').hidden = rows.length > 0;
}

function render() {
  renderSummary();
  renderList();
}

function scrollToPeriod() {
  const first = $('#list .row.cur');
  if (first) first.scrollIntoView({ block: 'start' });
}

// --- Redigering ---

function readForm(form) {
  const d = Object.fromEntries(new FormData(form));
  return {
    start: d.start.slice(0, 16),
    slutt: d.slutt.slice(0, 16),
    beskrivelse: d.beskrivelse.trim(),
    nettoSats: +d.nettoSats || 0,
    fakturertSats: +d.fakturertSats || 0,
  };
}

function updateCalc(form) {
  const e = readForm(form);
  form.slutt.setCustomValidity(e.start && e.slutt && e.slutt <= e.start ? 'Slutt må være etter start' : '');
  form.querySelector('.calc').textContent =
    `${L.fmtNum(L.hours(e))} t · netto ${L.fmtKr(L.netto(e))} · fakturert ${L.fmtKr(L.fakturert(e))}`;
}

function startEdit(id) {
  state.editing = id;
  renderList();
  const form = $('#list form');
  form.scrollIntoView({ block: 'nearest' });
  form.start.focus();
}

$('#list').addEventListener('click', async ev => {
  const btn = ev.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.closest('.row').dataset.id;
  const entry = state.entries.find(e => e.id === id);
  switch (btn.dataset.act) {
    case 'copy':
      return copy(L.toTsvRow(entry));
    case 'edit':
      return startEdit(id);
    case 'cancel':
      state.editing = null;
      return renderList();
    case 'delete':
      if (!confirm(`Slette registreringen ${L.fmtDay(entry.start)}?`)) return;
      try {
        await api('DELETE', 'entries/' + encodeURIComponent(id));
        state.entries = state.entries.filter(e => e.id !== id);
        state.editing = null;
        render();
      } catch (err) {
        toast(err.message);
      }
  }
});

$('#list').addEventListener('dblclick', ev => {
  const row = ev.target.closest('.row:not(.edit)');
  if (row) startEdit(row.dataset.id);
});

$('#list').addEventListener('input', ev => {
  const form = ev.target.closest('form');
  if (form) updateCalc(form);
});

$('#list').addEventListener('submit', async ev => {
  ev.preventDefault();
  const form = ev.target;
  const id = form.dataset.id === 'ny' ? crypto.randomUUID() : form.dataset.id;
  try {
    await put([{ id, ...readForm(form) }]);
    state.editing = null;
    render();
  } catch (err) {
    toast(err.message);
  }
});

$('#newBtn').addEventListener('click', () => {
  state.draft = L.draftFrom(state.entries.at(-1));
  startEdit('ny');
});

// --- Periode ---

function setPeriod(type, ref) {
  state.type = type;
  state.ref = ref;
  save('ptype', type);
  render();
  scrollToPeriod();
}
$('#ptype').addEventListener('change', e => setPeriod(e.target.value, state.ref));
$('#prev').addEventListener('click', () => setPeriod(state.type, L.shiftRef(state.type, state.ref, -1)));
$('#next').addEventListener('click', () => setPeriod(state.type, L.shiftRef(state.type, state.ref, 1)));
$('#today').addEventListener('click', () => setPeriod(state.type, new Date()));
$('#copyPeriod').addEventListener('click', () => {
  const r = range();
  copy(L.toTsvPeriod(state.entries.filter(e => L.inRange(e, r))));
});

// --- Excel ---

let xlsx;
function loadXlsx() {
  return (xlsx ??= new Promise((resolve, reject) => {
    document.head.append(el('script', {
      src: XLSX_URL,
      onload: () => resolve(window.XLSX),
      onerror: () => {
        xlsx = null;
        reject(new Error('Kunne ikke laste Excel-biblioteket'));
      },
    }));
  }));
}

$('#exportBtn').addEventListener('click', async () => {
  try {
    const X = await loadXlsx();
    const r2 = x => Math.round(x * 100) / 100;
    const head = ['Start', 'Slutt', 'Beskrivelse', 'Timer', 'Netto timepris', 'Fakturert timepris', 'Netto kr', 'Fakturert kr'];
    const rows = state.entries.map(e => [
      L.toSerial(e.start), L.toSerial(e.slutt), e.beskrivelse, r2(L.hours(e)),
      e.nettoSats, e.fakturertSats, r2(L.netto(e)), r2(L.fakturert(e)),
    ]);
    const ws = X.utils.aoa_to_sheet([head, ...rows]);
    rows.forEach((_, i) => {
      for (const c of [0, 1]) ws[X.utils.encode_cell({ r: i + 1, c })].z = 'dd.mm.yyyy hh:mm';
    });
    ws['!cols'] = [16, 16, 50, 8, 14, 16, 12, 12].map(wch => ({ wch }));
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws, 'Timer');
    X.writeFile(wb, `timer-${L.toLocal(new Date()).slice(0, 10)}.xlsx`);
  } catch (err) {
    toast(err.message);
  }
});

const imp = { wb: null, rows: [], header: -1, parsed: [] };
const form = $('#importForm');

$('#importBtn').addEventListener('click', () => $('#file').click());

$('#file').addEventListener('change', async ev => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  try {
    const X = await loadXlsx();
    // raw for CSV: hindrer at 01.02.2026 tolkes som amerikansk dato
    imp.wb = X.read(await file.arrayBuffer(), { raw: /\.csv$/i.test(file.name) });
    form.sheet.replaceChildren(...imp.wb.SheetNames.map(n => el('option', { value: n }, n)));
    const last = state.entries.at(-1);
    form.nettoSats.value = last?.nettoSats ?? '';
    form.fakturertSats.value = last?.fakturertSats ?? '';
    loadSheet();
    $('#importDlg').showModal();
  } catch (err) {
    toast(err.message);
  }
});

function loadSheet() {
  const ws = imp.wb.Sheets[form.sheet.value];
  imp.rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const { header, map } = L.guessMapping(imp.rows);
  imp.header = header;
  const width = Math.max(0, ...imp.rows.slice(0, 50).map(r => r.length));
  const columns = Array.from({ length: width }, (_, i) => {
    const h = imp.rows[header]?.[i];
    return el('option', { value: i }, h != null && h !== '' ? String(h) : `Kolonne ${window.XLSX.utils.encode_col(i)}`);
  });
  $('#mapping').replaceChildren(el('legend', {}, 'Kolonner'), ...Object.entries(L.FIELDS).map(([key, label]) => {
    const select = el('select', { name: 'map_' + key }, el('option', { value: -1 }, '—'), ...columns.map(o => o.cloneNode(true)));
    select.value = map[key] ?? -1;
    return field(label, select);
  }));
  preview();
}

function preview() {
  const map = Object.fromEntries(Object.keys(L.FIELDS).map(k => [k, +form['map_' + k].value]));
  const defaults = { nettoSats: +form.nettoSats.value || 0, fakturertSats: +form.fakturertSats.value || 0 };
  const { entries, skipped } = L.rowsToEntries(imp.rows.slice(imp.header + 1), map, defaults);
  const existing = new Set(state.entries.map(L.entryKey));
  imp.parsed = entries.filter(e => !existing.has(L.entryKey(e)));
  const dup = entries.length - imp.parsed.length;
  $('#importInfo').textContent = `${imp.parsed.length} nye registreringer` +
    (dup ? `, ${dup} finnes fra før` : '') + (skipped ? `, ${skipped} ${skipped === 1 ? 'rad' : 'rader'} kunne ikke tolkes` : '') + '.';
  $('#importPreview').replaceChildren(...imp.parsed.slice(0, 5).map(e =>
    el('li', {}, `${L.fmtDay(e.start)} ${L.fmtSpan(e)} · ${L.fmtNum(L.hours(e))} t · ${e.beskrivelse}`)));
}

form.addEventListener('change', ev => (ev.target === form.sheet ? loadSheet() : preview()));
form.addEventListener('input', preview);

$('#importDlg').addEventListener('close', async () => {
  if ($('#importDlg').returnValue !== 'ok' || !imp.parsed.length) return;
  try {
    const n = imp.parsed.length;
    await put(imp.parsed.map(e => ({ id: crypto.randomUUID(), ...e })));
    render();
    $('#list').scrollTop = $('#list').scrollHeight;
    toast(`Importerte ${n} registreringer`);
  } catch (err) {
    toast(err.message);
  }
});

// --- Oppstart ---

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

try {
  state.entries = (await api('GET', 'entries')).sort(L.byStart);
} catch (err) {
  toast(err.message);
}
render();
$('#list').scrollTop = $('#list').scrollHeight;
