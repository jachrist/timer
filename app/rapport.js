// Timeliste for en måned som PDF (A4 stående), etter malen "Timeliste for signering".
import { fmtDate, fmtNum, monthReport } from './lib.js';

const X = 14; // venstre marg (mm)
const COLS = [20, 24, 106, 18, 16]; // ukedag, dato, oppgaver, kunde, annet
const LINE = 4.2; // linjehøyde (mm) ved 9 pt
const BOTTOM = 280;

// opts: { firma, navn, kolonne, signaturTittel, signatar, bunntekst }
export function timelistePdf(jsPDF, entries, year, month, opts) {
  const { days, sum } = monthReport(entries, year, month);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const right = X + COLS.reduce((a, b) => a + b, 0);
  const colX = COLS.map((_, i) => X + COLS.slice(0, i).reduce((a, b) => a + b, 0));
  const hrs = x => fmtNum(x, 1);

  // Topptekst
  doc.setFont('helvetica', 'bold').setFontSize(10);
  doc.text(opts.firma || '', X, 22);
  doc.text('Timeliste', X, 27);
  doc.text(opts.navn || '', X + 44, 27);
  doc.text(String(year), X + 30, 32, { align: 'right' });
  doc.text(String(month + 1), X + 44, 32);

  let y = 38;
  const headerRow = () => {
    doc.setFont('helvetica', 'bold').setFontSize(9).setLineWidth(0.4);
    doc.rect(X, y, right - X, 5);
    for (const x of colX.slice(2)) doc.line(x, y, x, y + 5);
    doc.text('Oppgaver', colX[2] + COLS[2] / 2, y + 3.7, { align: 'center' });
    doc.text(opts.kolonne || 'Timer', colX[3] + 1, y + 3.7);
    doc.text('Annet', colX[4] + 1, y + 3.7);
    y += 5;
  };
  headerRow();

  // Én rad per dag, tekst og tall bunnjustert som i malen
  doc.setFont('helvetica', 'normal').setFontSize(9).setLineWidth(0.25);
  for (const d of days) {
    const lines = d.tekst ? doc.splitTextToSize(d.tekst, COLS[2] - 2) : [];
    const h = Math.max(1, lines.length) * LINE + 1;
    if (y + h > BOTTOM) {
      doc.addPage();
      y = 20;
      headerRow();
      doc.setFont('helvetica', 'normal').setFontSize(9).setLineWidth(0.25);
    }
    const base = y + h - 1.3;
    doc.rect(X, y, right - X, h);
    for (const x of colX.slice(1)) doc.line(x, y, x, y + h);
    doc.text(d.ukedag, colX[0] + 1, base);
    doc.text(fmtDate(d.dato), colX[2] - 1, base, { align: 'right' });
    lines.forEach((l, i) => doc.text(l, colX[2] + 1, base - (lines.length - 1 - i) * LINE));
    doc.text(hrs(d.timer), colX[4] - 1, base, { align: 'right' });
    y += h;
  }

  // Sum
  doc.text(hrs(sum), colX[4] - 1, y + 4, { align: 'right' });
  doc.text(hrs(0), right - 1, y + 4, { align: 'right' });
  doc.setFont('helvetica', 'bold').text('Faktureres', colX[3] + 1, y + 8.5);

  // Signaturfelt
  y += 13;
  if (y + 30 > BOTTOM) {
    doc.addPage();
    y = 20;
  }
  const bx = X + 14;
  doc.setLineWidth(0.4).rect(bx, y, right - bx, 26);
  doc.setFontSize(8).text(opts.signaturTittel || '', bx + 1.5, y + 9);
  doc.setFont('helvetica', 'normal').setFontSize(9);
  doc.setLineWidth(0.25).rect(bx, y + 17, 22, 4.5);
  doc.text(fmtDate(days.at(-1).dato), bx + 21, y + 20.4, { align: 'right' });
  doc.setLineWidth(0.4).line(bx, y + 21.5, right, y + 21.5);
  doc.text(opts.signatar || '', bx + 23, y + 25);

  if (opts.bunntekst) {
    doc.setFontSize(8).setTextColor(0, 128, 0);
    for (let p = 1; p <= doc.getNumberOfPages(); p++) doc.setPage(p).text(opts.bunntekst, X, 290);
  }
  return doc;
}
