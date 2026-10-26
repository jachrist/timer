# Timer

Enkel app for arbeidstimer: registreringer med start, slutt og beskrivelse, oppsummert per uke/måned/år.

## Preferanser (eier)

- Node/JavaScript foran Python.
- Så få komponenter som mulig: ingen rammeverk eller byggesteg i frontend, få avhengigheter.
- Apper pakkes som PWA og hostes i Azure (Static Web Apps, Functions eller App Service).
- Brukergrensesnitt og kodekommentarer på norsk.

## Struktur

- `app/` – statisk PWA (vanilla JS, ES-moduler). `lib.js` har all ren logikk og testes i Node; `app.js` er DOM/UI.
- `api/` – Azure Functions (Node, v4-modellen) som Static Web Apps-managed API.
  `store.js` bruker Table Storage når `STORAGE_CONNECTION_STRING` er satt, ellers `api/.data/entries.json`.
- `test/` – `npm test` (node:test).

## Datamodell

`{ id, start, slutt, beskrivelse, nettoSats, fakturertSats }` – tidspunkt som lokal tid `YYYY-MM-DDTHH:MM`.
Timepris lagres per registrering. Timer og kroner beregnes, lagres ikke.
