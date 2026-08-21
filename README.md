# 99tk POS

A point-of-sale and inventory system built for a small 99tk store.
One counter, a few hundred products, cash and mobile payments, and
no fuss. The same code runs on a Linux laptop during development,
on a Windows machine behind the counter, and on a small VPS.

## What works

- First-run setup wizard with a one-time emergency recovery code
- PIN login (staff and admin roles), admin-only user management
- Products with auto-generated EAN-13 barcodes when none is given
- Categories managed up front (add, rename, delete, view items, filter)
- Stock-in with a full movement history per product
- Low-stock alerts (threshold per product, filterable list)
- CSV and Excel (.xlsx/.xls) imports: any bad row rejects the whole
  file, existing items update by barcode, nothing is ever deleted
- Sales cart, checkout, cash / bKash / Nagad payments, receipts
- Label printing for the Gprinter GP-3120TUD (40x30 mm, TSPL)
- Live backup of every write to rotating JSONL files
- Reports: today's numbers, 14-day chart, category and top products
- Settings: store name, logo, PIN change, printer connections

## Printing

Two printers are supported:

- **Receipt printer** — Xprinter XP-Q807K, 80 mm thermal, ESC/POS
- **Label printer** — Gprinter GP-3120TUD, TSPL

Printing works three ways, from most to least convenient:

1. **WebUSB** (recommended): open the app in Chrome or Edge on the
   computer that has the printer plugged in, go to Settings >
   Printers, and connect. The browser remembers the printer.
   WebUSB needs a secure context, so HTTPS or localhost.
2. **Server USB fallback**: the server itself talks to the printer
   over USB (`usb` package). On Windows the printer must be
   installed with the **Generic / Text Only** driver; the server
   finds the printer automatically, or you can set its USB vendor
   and product IDs in Settings.
3. **Simulator**: with no printer attached, every print button
   shows exactly what the printer would receive (ESC/POS hex dump
   or TSPL commands), so everything is testable before the
   hardware arrives.

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

The server stores everything in `server/data/` by default. Point
it elsewhere with `DATA_DIR` and change the port with `PORT`:

```bash
DATA_DIR=/var/lib/99tk-pos PORT=3001 npm --prefix server start
```

## Deployment guide (VPS + HTTPS)

The shop network is a single LAN: the counter PC (with the two
printers) and the owner's phone (viewing reports, stock, sales).
The VPS only needs to be reachable from these two places, so it
does not need to be public at all — a private network is safest.
For simplicity this guide covers a public VPS; any good firewall
and a VPN, tailscale or similar can replace it.

### 1. Server

A small VPS with Debian/Ubuntu, 1 vCPU and 1 GB RAM is plenty —
SQLite is happy with a single connection.

```bash
sudo apt update && sudo apt install -y nodejs npm caddy
```

Install Node 24 if the distro ships something older
(https://nodejs.org), then:

```bash
sudo mkdir -p /opt/99tk-pos /var/lib/99tk-pos
sudo chown "$USER" /opt/99tk-pos /var/lib/99tk-pos
git clone git@github.com:abrakadabra-exe/pos_99store.git /opt/99tk-pos/app
cd /opt/99tk-pos/app
npm install
npm --prefix client run build
```

Run it as a service (`/etc/systemd/system/99tk-pos.service`):

```ini
[Unit]
Description=99tk POS
After=network.target

[Service]
WorkingDirectory=/opt/99tk-pos/app
Environment=DATA_DIR=/var/lib/99tk-pos
Environment=PORT=3001
ExecStart=/usr/bin/node server/src/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now 99tk-pos
```

### 2. HTTPS

Point `pos.yourdomain.com` at the VPS and let Caddy fetch the
certificate automatically (`/etc/caddy/Caddyfile`):

```
pos.yourdomain.com {
    reverse_proxy localhost:3001
}
```

```bash
sudo systemctl reload caddy
```

### 3. Counter PC

- Install Chrome or Edge. Open https://pos.yourdomain.com, log in,
  and connect both printers in Settings > Printers via WebUSB.
- If WebUSB is inconvenient (browser settings, driver conflicts),
  use the server USB fallback instead: install the XP-Q807K and
  GP-3120TUD with the **Generic / Text Only** Windows driver and
  leave them plugged into the PC running the app. Set the vendor
  and product IDs in Settings if they are not found automatically.
- The Winson WNL-1051 barcode scanner types into whatever has
  focus (keyboard-wedge HID), so the POS page just works.

### 4. Phone

Open https://pos.yourdomain.com on the phone, log in as the admin,
and use the Reports, Sales, Products and Dashboard pages. The
layout is mobile-friendly; the POS page itself is meant for the
counter PC.

### 5. Data

Everything lives in `/var/lib/99tk-pos/`:

- `pos.db` — the SQLite database
- `backups/` — rotating JSONL files written live on every write

Back both up nightly, e.g. a cron job that tars the directory
and uploads it somewhere off the VPS. Restoring is copying
`pos.db` back and restarting the service. The database is the
single source of truth; the JSONL files are a belt-and-suspenders
record of every change.

## Security

- **PINs** are hashed with scrypt (N=16384, r=8, p=1) and a random
  salt; verification uses a constant-time comparison.
- **Login and PIN recovery are rate-limited**: after 5 failed
  logins (3 recovery attempts) per account + IP, further attempts
  return `429` for 15 minutes.
- **Sessions are revocable**: every login creates a server-side
  session record. Logging out revokes it, and a deactivated account
  loses access immediately — no need to wait for the 30-day token
  to expire. This also means everyone must log in again after an
  upgrade to a version that adds sessions.
- **JWT signing key**: generated on first run and stored in
  `server/data/session-secret` (mode 0600). Set the `JWT_SECRET`
  environment variable to pin your own key. Admins can rotate the
  key and revoke every session from Settings-independent API call
  (`POST /api/auth/rotate-secret`).
- **SQL injection**: all queries are parameterized.
- Rate limiting keys on the client IP; keep the app behind a single
  reverse proxy (Caddy is documented below) so the real IP is seen.

## CSV/Excel import format

The file must have exactly these columns, in any order:

```
barcode,name_en,category,cost_price,sale_price,stock,low_stock_threshold
```

- An empty `barcode` generates one automatically.
- An existing barcode updates that product; its `stock` column is
  added to the current stock.
- A new barcode creates the product with that opening stock.
- Wrong columns or any invalid row reject the whole file.
- Files up to 8 MB; .csv, .xlsx and .xls all work.
- Categories must be created first (Categories tab): a row whose
  category does not exist rejects the whole file.

## Project layout

```
server/src/db.js          SQLite schema and migrations
server/src/auth.js        PIN hashing, tokens, middleware
server/src/backup.js      live JSONL backup of every write
server/src/receipt.js     ESC/POS receipt builder (logo, totals, cut)
server/src/label.js       TSPL label builder (EAN-13, price, copies)
server/src/routes/        auth, users, products, sales, labels,
                          settings, reports, print (server USB),
                          categories
client/src/pages/         setup, login, dashboard, products, pos,
                          sales, reports, users, settings, categories
client/src/printer.js     WebUSB connect / send / auto-reconnect
client/src/components/    shell, receipt, label preview/modal, logo
```

## Notes

- Development data lives in `server/data/` (gitignored). Wipe it to
  replay the first-run experience.
- Prices are in BDT and displayed with the taka sign.
- Receipts stay in English; the UI can mix English and Bangla.
- WebUSB needs a secure context: HTTPS in production, localhost in
  development. Firefox does not support WebUSB; use Chrome/Edge on
  the counter PC.