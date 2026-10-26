import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../app/lib.js';

const e = (start, slutt, nettoSats = 500, fakturertSats = 1000, beskrivelse = 'Arbeid') =>
  ({ start, slutt, nettoSats, fakturertSats, beskrivelse });

test('timer og kroner per registrering og sum', () => {
  const a = e('2026-10-26T08:00', '2026-10-26T15:30');
  const b = e('2026-10-27T22:00', '2026-10-28T01:00', 400, 900);
  assert.equal(L.hours(a), 7.5);
  assert.equal(L.netto(a), 3750);
  assert.equal(L.hours(b), 3);
  assert.deepEqual(L.summarize([a, b]), { timer: 10.5, netto: 3750 + 1200, fakturert: 7500 + 2700 });
  assert.equal(L.hours(e('2026-10-26T10:00', '2026-10-26T09:00')), 0);
});

test('perioder: ISO-uke, måned og år', () => {
  const ref = new Date(2026, 9, 28); // onsdag 28.10.2026
  assert.deepEqual(L.periodRange('uke', ref), { from: '2026-10-26T00:00', to: '2026-11-02T00:00' });
  assert.deepEqual(L.periodRange('maned', ref), { from: '2026-10-01T00:00', to: '2026-11-01T00:00' });
  assert.deepEqual(L.periodRange('aar', ref), { from: '2026-01-01T00:00', to: '2027-01-01T00:00' });
  assert.equal(L.periodLabel('uke', ref), 'Uke 44 2026');
  assert.equal(L.periodLabel('uke', new Date(2027, 0, 1)), 'Uke 53 2026');
  assert.equal(L.periodLabel('maned', ref), 'oktober 2026');
  assert.equal(L.periodLabel('maned', L.shiftRef('maned', new Date(2026, 0, 31), 1)), 'februar 2026');
  assert.ok(L.inRange(e('2026-11-01T23:59', '2026-11-02T01:00'), L.periodRange('uke', ref)));
  assert.ok(!L.inRange(e('2026-11-02T00:00', '2026-11-02T01:00'), L.periodRange('uke', ref)));
});

test('ny linje kopierer forrige på dagens dato', () => {
  const prev = e('2026-10-20T22:00', '2026-10-21T02:00', 450, 950, 'Nattjobb');
  assert.deepEqual(L.draftFrom(prev, new Date(2026, 9, 26, 12)), {
    start: '2026-10-26T22:00', slutt: '2026-10-27T02:00', beskrivelse: 'Nattjobb', nettoSats: 450, fakturertSats: 950,
  });
  assert.equal(L.draftFrom(undefined, new Date(2026, 9, 26)).start, '2026-10-26T08:00');
});

test('kopiering som tabulatorseparert tekst', () => {
  const a = e('2026-10-26T08:00', '2026-10-26T15:30', 500, 1000, 'Møte\tmed\nkunde');
  assert.equal(L.toTsvRow(a), '26.10.2026\t08:00\t15:30\tMøte med kunde\t7,50\t3750,00');
  assert.equal(L.toTsvPeriod([a]).split('\n').at(-1), 'Sum\t\t\t\t7,50\t3750,00');
});

test('tolker Excel-celler', () => {
  assert.deepEqual(L.cellParts(46321), { dato: '2026-10-26', tid: '00:00' });
  assert.deepEqual(L.cellParts(46321.34375), { dato: '2026-10-26', tid: '08:15' });
  assert.deepEqual(L.cellParts(0.5), { tid: '12:00' });
  assert.deepEqual(L.cellParts('26.10.2026 08:15'), { dato: '2026-10-26', tid: '08:15' });
  assert.deepEqual(L.cellParts('2026-10-26'), { dato: '2026-10-26' });
  assert.deepEqual(L.cellParts('8.15'), { tid: '08:15' });
  assert.deepEqual(L.cellParts(null), {});
  assert.equal(L.toSerial('2026-10-26T08:15'), 46321.34375);
});

test('gjetter kolonner og importerer rader', () => {
  const rows = [
    ['Timeliste 2026'],
    ['Dato', 'Fra', 'Til', 'Timer', 'Beskrivelse', 'Fakturert timepris'],
    [46321, 0.333333, 0.645833, 7.5, 'Utvikling', 1100],
    ['27.10.2026', '22:00', '01:30', 3.5, 'Nattdrift', null],
    [null, null, null, 11, 'Sum', null],
    [],
  ];
  const { header, map } = L.guessMapping(rows);
  assert.equal(header, 1);
  assert.deepEqual(map, { dato: 0, start: 1, slutt: 2, beskrivelse: 4, fakturertSats: 5 });
  const { entries, skipped } = L.rowsToEntries(rows.slice(header + 1), map, { nettoSats: 500, fakturertSats: 1000 });
  assert.equal(skipped, 1);
  assert.deepEqual(entries, [
    { start: '2026-10-26T08:00', slutt: '2026-10-26T15:30', beskrivelse: 'Utvikling', nettoSats: 500, fakturertSats: 1100 },
    { start: '2026-10-27T22:00', slutt: '2026-10-28T01:30', beskrivelse: 'Nattdrift', nettoSats: 500, fakturertSats: 1000 },
  ]);
});

test('egen eksport kan importeres igjen', () => {
  const head = ['Start', 'Slutt', 'Beskrivelse', 'Timer', 'Netto timepris', 'Fakturert timepris', 'Netto kr', 'Fakturert kr'];
  const { map } = L.guessMapping([head]);
  assert.deepEqual(map, { start: 0, slutt: 1, beskrivelse: 2, nettoSats: 4, fakturertSats: 5 });
  const a = e('2026-10-26T08:00', '2026-10-26T15:30');
  const row = [L.toSerial(a.start), L.toSerial(a.slutt), a.beskrivelse, 7.5, 500, 1000, 3750, 7500];
  assert.deepEqual(L.rowsToEntries([row], map).entries, [a]);
});
