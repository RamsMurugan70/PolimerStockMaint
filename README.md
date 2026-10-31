# Stock & Dispatch

Polymer Products stock and dispatch records, with a publisher mode and a view-only mode.

No business records are kept in this repository. The app starts empty, and the records come from what the publisher publishes.

## The two modes

- **Normal mode** is the site's plain link. People can browse, filter, print and export, but cannot change anything.
- **Publisher mode** is the same link with `/?publisher` added. It asks for the publisher key once on each computer and browser, and opens everything: stock entry, dispatch, returns, bag packing and Import.

## Using publisher mode

- **Daily work:** enter records, or import a file, then press **Publish** in the yellow strip. Entries stay on that computer and browser until then.
- **Moving existing records:** in the old copy of the app, use **Export All Data (Excel)**. In publisher mode, use **Import Data (Excel)** on Home, check the totals, and press **Publish**. Import replaces all coils, dispatches and bags with those in the file.
- **Dropping changes:** **Discard changes** goes back to the published records.
- **One person at a time:** a publish replaces the whole record set. If someone else published since you started, Publish asks before replacing their version, but it cannot merge the two.

## Changing the app

The publisher key is the site's `PPC_PUBLISH_KEY` setting on Netlify. Published records are stored separately from the code, so deploying does not affect them.

Never commit exported files, the `data` folder, or real records.

## Running it on one computer

It needs Node.js. Double-click **Start app.bat**, or run:

```bash
node server/server.js
```

The app opens at http://localhost:8091/. Keep the window open while using it. The local publisher key is in `data/publish-key.txt`, which is created on first start. `data/` also holds the published records, every past version, and every imported file.

## Tests

```bash
npm test
```

## Layout

- `public/index.html`, `public/js/stock-app.js`: the app
- `public/js/stock-boot.js`, `public/js/ppc.js`: the two modes and the Publish button
- `server/api.js`: the publish rules, shared by the local server and the cloud
- `server/server.js`, `server/storage.js`: the local server and its storage
- `netlify/functions/api.mjs`, `server/blob-storage.mjs`: the cloud function and its storage

## Differences from the original page

- **Import** restores dispatches and bag packing as well as coils.
- **Opening `index.html` directly as a file** gives the original behaviour, saved in that browser only, with no publishing.
