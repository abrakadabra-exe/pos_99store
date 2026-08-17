# 99tk POS

A point-of-sale and inventory system built for a small 99tk dollar
store. The plan is one counter, a few hundred products, cash and
mobile payments, and no fuss. The stack is chosen so the same code
runs on a Linux laptop during development and on a Windows machine
behind the counter in production.

## What works so far

- First-run setup wizard with a one-time emergency recovery code
- PIN login (staff and admin roles), admin-only user management
- Products with auto-generated EAN-13 barcodes when none is given
- Stock-in with a full movement history per product
- Low-stock alerts (threshold per product, filterable list)
- Strict CSV import: any bad row rejects the whole file, existing
  items update by barcode, nothing is ever deleted
- Live backup of every write to rotating JSONL files
- Client UI: setup, login, dashboard, products (search, add, edit,
  stock-in, import, history)

## Still on the roadmap

- Sales cart, checkout, cash / bKash / Nagad payments
- Receipt printing (ESC/POS, auto-cutter receipt printer)
- Label printing (TSPL, 25-82mm label printer)
- Hardware simulator for development on this machine
- WebUSB printing with OS-driver fallback
- Reports, settings, deployment guide (VPS + HTTPS)

## Stack

- Server: Node.js, Express 5, better-sqlite3
- Client: React 19, Vite 8, Tailwind CSS v4, react-router 7
- Node 24 is expected (better-sqlite3 ships prebuilt binaries)

## Getting started

```bash
npm install
# npm 11 blocks install scripts by default; approve the native module:
npm approve-scripts better-sqlite3

npm run dev
```

Open http://localhost:5173. The first run shows the setup wizard,
which creates the admin account and reveals the one-time recovery
code. The API runs on port 3001; Vite proxies `/api` to it.

The client also builds into `client/dist`, which the server serves
directly if you would rather run a single process:

```bash
npm --prefix client run build
npm --prefix server start
```

## CSV import format

The file must have exactly these columns, in any order:

```
barcode,name_en,category,cost_price,sale_price,stock,low_stock_threshold
```

- An empty `barcode` generates one automatically.
- An existing barcode updates that product; its `stock` column is
  added to the current stock.
- A new barcode creates the product with that opening stock.
- Wrong columns or any invalid row reject the whole file.

## Project layout

```
server/src/db.js          SQLite schema and migrations
server/src/auth.js        PIN hashing, tokens, middleware
server/src/backup.js      live JSONL backup of every write
server/src/routes/        auth, users, products (incl. CSV import)
client/src/pages/         setup, login, dashboard, products
client/src/components/    app shell
```

## Notes

- Development data lives in `server/data/` (gitignored). Wipe it to
  replay the first-run experience.
- Prices are in BDT and displayed with the taka sign.
- Mixed English/Bangla UI is fine; receipts stay in English.