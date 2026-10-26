# Timer

Registrer arbeidstimer (start, slutt, beskrivelse) og se timer, netto og fakturert beløp per uke, måned eller år.
Kan installeres som app (PWA) på PC og mobil.

- **Liste** sortert stigende på dato. Hver linje viser start, slutt, tekst, timer og netto kr.
  ✎ (eller dobbeltklikk) redigerer, ⧉ kopierer linjen som tabulatorseparert tekst som limes rett inn i Excel o.l.
- **Ny registrering** kopierer forrige linje (tekst, timepriser, klokkeslett) til dagens dato.
- **Timepris** (netto og fakturert) lagres per registrering, så gamle tall endres ikke når prisen endres.
- **Oppsummering** for valgt periode (inneværende måned som standard). Linjene i perioden er markert.
  «Kopier periode» kopierer periodens linjer med sum.
- **Importer Excel**: velg ark og kolonner (gjettes fra overskriftene), og timepris for rader som mangler den.
  Klokkeslett over midnatt håndteres, og linjer som finnes fra før hoppes over.
- **Eksporter** lager en .xlsx med alle registreringer (kan også importeres igjen).

## Oppbygning

| Del | Teknologi |
| --- | --- |
| `app/` | Statisk PWA, vanilla JS uten byggesteg. SheetJS lastes fra CDN ved import og eksport. |
| `api/` | Azure Functions (Node 22), kjøres som managed API i Static Web Apps. |
| Lagring | Azure Table Storage (tabell `registreringer`, én partisjon per innlogget bruker). |
| Innlogging | Static Web Apps sin innebygde Microsoft-innlogging. API-et slipper bare til e-postadresser i `TILLATTE_BRUKERE`. |

## Utvikling

```sh
npm test       # enhetstester
npm start      # SWA CLI: app på http://localhost:4280 med API og simulert innlogging
```

`npm start` krever Azure Functions Core Tools (`npm i -g azure-functions-core-tools@4`) og `npm install` i `api/`.
Uten `STORAGE_CONNECTION_STRING` lagres data i `api/.data/entries.json`.
Ved simulert innlogging må adressen du oppgir stå i `TILLATTE_BRUKERE` (f.eks. i `api/local.settings.json`).

## Oppsett i Azure (én gang) - gjort

1. Opprett en **Storage account** og kopier connection string.
2. Opprett en **Static Web App** (Free-planen holder) med deployment source «Other».
3. Under *Environment variables* i Static Web App: legg til `STORAGE_CONNECTION_STRING` og
   `TILLATTE_BRUKERE` (e-postadressen(e) du logger inn med, kommaseparert).
4. Kopier *deployment token* og lagre den som GitHub-secret `AZURE_STATIC_WEB_APPS_API_TOKEN`.
   Push til `main` tester og deployer (`.github/workflows/deploy.yml`).
