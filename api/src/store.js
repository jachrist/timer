// Lagring: Azure Table Storage når STORAGE_CONNECTION_STRING er satt, ellers en JSON-fil (lokal utvikling).
const fs = require('node:fs/promises');
const path = require('node:path');

const FIELDS = ['start', 'slutt', 'beskrivelse', 'nettoSats', 'fakturertSats'];
const pick = e => Object.fromEntries(FIELDS.map(k => [k, e[k]]));

function tableStore(connectionString) {
  const { TableClient, odata } = require('@azure/data-tables');
  const client = TableClient.fromConnectionString(connectionString, 'registreringer');
  let ready;
  const init = () => (ready ??= client.createTable().catch(err => { ready = null; throw err; }));

  return {
    async list(user) {
      await init();
      const out = [];
      const query = { queryOptions: { filter: odata`PartitionKey eq ${user}` } };
      for await (const e of client.listEntities(query)) out.push({ id: e.rowKey, ...pick(e) });
      return out;
    },
    async save(user, entries) {
      await init();
      for (let i = 0; i < entries.length; i += 100) {
        const batch = entries.slice(i, i + 100);
        await client.submitTransaction(batch.map(e => ['upsert', { partitionKey: user, rowKey: e.id, ...pick(e) }, 'Replace']));
      }
    },
    async remove(user, id) {
      await init();
      await client.deleteEntity(user, id).catch(err => { if (err.statusCode !== 404) throw err; });
    },
  };
}

function fileStore(file) {
  const read = async () => {
    try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return {}; }
  };
  const write = async db => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(db, null, 1));
  };

  return {
    async list(user) {
      return Object.values((await read())[user] ?? {});
    },
    async save(user, entries) {
      const db = await read();
      db[user] ??= {};
      for (const e of entries) db[user][e.id] = { id: e.id, ...pick(e) };
      await write(db);
    },
    async remove(user, id) {
      const db = await read();
      delete db[user]?.[id];
      await write(db);
    },
  };
}

const conn = process.env.STORAGE_CONNECTION_STRING;
module.exports = conn ? tableStore(conn) : fileStore(path.join(__dirname, '..', '.data', 'entries.json'));
