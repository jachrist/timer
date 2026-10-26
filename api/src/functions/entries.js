const { app } = require('@azure/functions');
const store = require('../store');

const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const ID = /^[\w-]{1,64}$/;

// Static Web Apps sender innlogget bruker i denne headeren. Hver bruker får sin egen partisjon.
// Bare e-postadresser i TILLATTE_BRUKERE (kommaseparert) slipper til.
function principal(req) {
  const header = req.headers.get('x-ms-client-principal');
  if (!header) return { userId: 'lokal' };
  return JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
}

function allowed(p) {
  if (p.userId === 'lokal') return true;
  const list = (process.env.TILLATTE_BRUKERE ?? '').toLowerCase().split(',').map(s => s.trim());
  return list.includes(String(p.userDetails).toLowerCase());
}

const forbidden = p => ({ status: 403, jsonBody: { feil: `Ingen tilgang for ${p.userDetails}. Legg adressen inn i TILLATTE_BRUKERE.` } });

function clean(e) {
  if (!e || !ID.test(e.id)) throw new Error('Ugyldig id');
  if (!TIME.test(e.start) || !TIME.test(e.slutt)) throw new Error('Ugyldig start eller slutt');
  const num = v => (Number.isFinite(+v) ? +v : 0);
  return {
    id: e.id,
    start: e.start,
    slutt: e.slutt,
    beskrivelse: String(e.beskrivelse ?? '').slice(0, 4000),
    nettoSats: num(e.nettoSats),
    fakturertSats: num(e.fakturertSats),
  };
}

// GET: alle registreringer. PUT: lagre (opprett eller oppdater) en liste registreringer.
async function entries(req) {
  const p = principal(req);
  if (!allowed(p)) return forbidden(p);
  const user = p.userId;
  if (req.method === 'GET') return { jsonBody: await store.list(user) };
  let list;
  try {
    const body = await req.json();
    list = (Array.isArray(body) ? body : [body]).map(clean);
    if (list.length > 5000) throw new Error('For mange registreringer i én forespørsel');
  } catch (err) {
    return { status: 400, jsonBody: { feil: err.message } };
  }
  await store.save(user, list);
  return { jsonBody: list };
}

async function remove(req) {
  const p = principal(req);
  if (!allowed(p)) return forbidden(p);
  await store.remove(p.userId, req.params.id);
  return { status: 204 };
}

app.http('entries', { methods: ['GET', 'PUT'], authLevel: 'anonymous', route: 'entries', handler: entries });
app.http('entry', { methods: ['DELETE'], authLevel: 'anonymous', route: 'entries/{id}', handler: remove });

module.exports = { entries, remove };
