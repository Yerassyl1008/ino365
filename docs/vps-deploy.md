# VPS deploy — waiters and owner from 4G (cafe PC optional)

Status: CURRENT

Waiters must log in from phones over the internet **without cafe Wi‑Fi** and **without depending on the cafe monoblock**. The source of truth is a 24/7 VPS (Node + Express + SQLite), not Electron on the hall PC.

A Cloudflare tunnel to the cafe PC is the **old optional path**: the monoblock must stay on. This cafe rejected that model.

FloAdmin / RevFlo cloud accounts are **not required**.

We cannot rent the VPS for you. Buy it from Timeweb, PS.kz, or any host (~monthly), then follow this file.

## What each person opens (after HTTPS)

| Who | Opens from 4G / home | Login |
| --- | --- | --- |
| Waiter | `https://waiter.your-domain.kz` **or** `https://kassa.your-domain.kz/server-standalone` | Waiter PIN (4–6 digits) |
| Owner (reports, settings) | `https://kassa.your-domain.kz` | Owner PIN **or** email + password (prefer a password) |
| Hall till (optional) | Same `https://kassa…` URL in a browser on the monoblock | Cashier / owner as usual |
| Kitchen screen (optional) | `https://kds.your-domain.kz` | Kitchen PIN |

The cafe PC **can be off**. Orders live in SQLite on the VPS (`FLO_DATA_DIR`, default `/var/lib/flocafe/flo.db`).

## Printing (honest)

Kitchen and cashier **thermal printers sit in the cafe**. If nobody is on-site, paper cannot come out of a printer in an empty room.

- **Orders exist in the cloud** as soon as a waiter saves them. Kitchen can work from the KDS screen in a browser.
- **Paper KOT / receipt** needs either:
  1. A device **in the cafe** that is on (browser print dialog, USB, or LAN `:9100` printer attached to that device), or
  2. A LAN printer that the **VPS can reach** (almost never true without VPN / port-forward; do not assume this).

The VPS **cannot** print to a USB printer plugged into a switched-off monoblock. There is no print agent in this repo yet.

## Security

- Serve only **HTTPS**. PIN login over HTTP on the public internet is not acceptable.
- Do **not** post the kassa/waiter URL on Instagram or a public menu. Anyone with the URL can still try PINs (rate-limited).
- Give waiters **waiter PINs**. The owner should use a **password**, not a short PIN, from home.
- Keep `JWT_SECRET` stable in `.env` after first launch (or leave unset and let SQLite store it under `FLO_DATA_DIR`).

## 1. Buy a VPS (Timeweb / PS.kz)

1. Order a Linux VPS (Ubuntu 22.04 or 24.04). 1 vCPU / 1–2 GB RAM is enough for one cafe.
2. Note the **public IPv4**.
3. Create a sudo user, or use root once to create `flocafe`.

```bash
sudo adduser --system --group --home /opt/flocafe flocafe
sudo mkdir -p /opt/flocafe /var/lib/flocafe
sudo chown -R flocafe:flocafe /opt/flocafe /var/lib/flocafe
```

## 2. DNS (ps.kz domain)

In the domain panel (PS.kz or wherever the domain lives), add **A records** to the VPS IP:

| Name | Type | Value |
| --- | --- | --- |
| `kassa` | A | VPS IPv4 |
| `waiter` | A | same IPv4 |
| `kds` | A | same IPv4 (optional) |

Wait 5–30 minutes. Check: `ping kassa.your-domain.kz`.

You can use one host only (`kassa`) and tell waiters to open `/server-standalone` on it.

## 3. Install Node 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential python3
node -v   # v22.x
```

`better-sqlite3` needs a compiler (`build-essential`).

## 4. Copy the project and build

**Do not** run a normal `npm ci` on the VPS — the repo `postinstall` downloads Electron. Skip scripts, then rebuild SQLite for **Node** (not Electron):

```bash
sudo -u flocafe -H bash
cd /opt/flocafe
# copy or git clone the FloCafe project into /opt/flocafe
npm ci --ignore-scripts
npm rebuild better-sqlite3
npm run build:frontend
npx tsc && node scripts/copy-runtime-assets.cjs
```

Equivalent: `npm run build:frontend && npm run build` after `npm ci --ignore-scripts && npm rebuild better-sqlite3`.

Create `/opt/flocafe/.env`:

```
NODE_ENV=production
FLO_DATA_DIR=/var/lib/flocafe
FLO_TRUST_PROXY=1
PORT=3001
KDS_PORT=3002
SERVER_APP_PORT=3003
FLO_PUBLIC_ORIGINS=https://kassa.your-domain.kz,https://waiter.your-domain.kz
FLO_WAITER_PUBLIC_URL=https://waiter.your-domain.kz
```

## 5. systemd

```bash
sudo cp /opt/flocafe/deploy/flocafe.service /etc/systemd/system/flocafe.service
sudo systemctl daemon-reload
sudo systemctl enable --now flocafe
sudo systemctl status flocafe
curl -sS http://127.0.0.1:3001/api/health
```

The process binds **0.0.0.0** (LAN + localhost). Do not publish ports 3001–3003 on the firewall; only 80/443 via Nginx/Caddy.

Without Electron: `npm start` still launches the **desktop app**. On the VPS use:

```bash
node scripts/vps-server.cjs
```

Local development without a window is `node dev-server.js` (after `npx tsc`).

## 6. HTTPS (Let's Encrypt)

### Caddy (simplest)

```bash
sudo apt-get install -y caddy
sudo cp /opt/flocafe/deploy/Caddyfile.example /etc/caddy/Caddyfile
# edit domain names
sudo systemctl reload caddy
```

### Nginx + certbot

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo cp /opt/flocafe/deploy/nginx.conf.example /etc/nginx/sites-available/flocafe
# edit domain names
sudo ln -s /etc/nginx/sites-available/flocafe /etc/nginx/sites-enabled/flocafe
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d kassa.your-domain.kz -d waiter.your-domain.kz
```

## 7. First login on the VPS

Open `https://kassa.your-domain.kz`. Complete first-run setup (owner email + password). Enable **Server App** in Settings. Set waiter PINs.

In **Settings → Internet & VPS** save `https://kassa.your-domain.kz` as the public address so QR codes show the 4G waiter link.

## Firewall

Allow 22, 80, 443. Deny 3001–3003 from the internet.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

## Cafe monoblock (optional)

Staff in the hall can open the **same HTTPS URL** in Chrome. They do not need a local Electron install for waiters and the owner at home to work.

If you still run Electron in the hall against a **different** `flo.db`, you will have two databases. For this architecture, run **one** VPS database.

## Backup

Copy `/var/lib/flocafe/flo.db` (and `-wal`/`-shm` if present) daily. Settings → Backup also works when you are logged in as owner.

## Ports

| Port | Process | Public hostname |
| --- | --- | --- |
| 3001 | POS + reports + `/server-standalone` | `kassa.` |
| 3002 | KDS | `kds.` |
| 3003 | Waiter Server App (`/` → `/server-standalone`) | `waiter.` |
