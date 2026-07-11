# Deploying ConfuseCode

The VPS runs **two** projects. ConfuseCode must not disturb the other one.

| service | port | exposed | owner |
|---|---|---|---|
| basantarana.com (Next) | 3000 | public | `basantarana` |
| ConfuseCode frontend | **3001** | localhost only | `confusecode` |
| ConfuseCode backend | **4000** | localhost only | `confusecode` |
| PostgreSQL | 5432 | localhost only | `postgres` |
| Caddy | 80/443 | public | `caddy` |

Only Caddy is public. Everything else binds to `127.0.0.1`, so the only way in
is through the reverse proxy.

## First deploy

```bash
# as confusecode, in /var/www/confusecode.com
git pull

cd backend
npm install
npm run build          # tsc → dist/
npm run migrate        # applies any new migrations; safe to re-run

cd ../frontend
npm install
npm run build          # next build → .next/
```

`backend/.env` is **not** in git and must exist on the server (see
`backend/db/README.md`). It holds the DB password, the cookie secret, and the
OAuth credentials. `chmod 600 .env`.

## Install the services

```bash
sudo cp deploy/confusecode-backend.service  /etc/systemd/system/
sudo cp deploy/confusecode-frontend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now confusecode-backend confusecode-frontend

systemctl status confusecode-backend confusecode-frontend
```

Verify, from the server:

```bash
curl localhost:4000/health              # {"status":"ok"}
curl localhost:4000/api/me              # {"user":null}
curl localhost:3001/api/health          # proves the frontend can reach the backend
```

Check the backend really has its database:

```bash
journalctl -u confusecode-backend | grep accounts
# want: "accounts + history enabled (DATABASE_URL is set)"
# if it says "accounts DISABLED", .env isn't being read
```

## nginx (not Caddy)

The design doc planned for Caddy, but this VPS **already runs nginx** on 80/443
serving basantarana.com. Installing Caddy would mean two web servers fighting for
the same ports, so we use nginx. Same topology, different tool.

We ADD a site — never edit the existing one. nginx routes by `server_name`, so
both domains coexist on one IP.

```bash
sudo cp deploy/nginx-confusecode.com.conf /etc/nginx/sites-available/confusecode.com
sudo ln -s /etc/nginx/sites-available/confusecode.com /etc/nginx/sites-enabled/
sudo nginx -t                      # MUST pass before reloading
sudo systemctl reload nginx
```

`nginx -t` is not optional. A reload with a broken config takes basantarana.com
down too.

### HTTPS

```bash
sudo certbot --nginx -d confusecode.com -d www.confusecode.com
```

Certbot edits the site file in place to add the TLS listener, the HTTP→HTTPS
redirect, and HSTS, and installs a renewal timer. DNS must already point here
(it does: both `confusecode.com` and `www` resolve to this box).

**After certbot succeeds**, `backend/.env` must say:

```
COOKIE_SECURE=true
PUBLIC_ORIGIN=https://confusecode.com
ALLOWED_ORIGIN=https://confusecode.com
```

then `sudo systemctl restart confusecode-backend`. Until HTTPS is live, those
must be `false` / `http://…`, or the browser will silently discard the session
cookie and sign-in will appear to do nothing at all.

### Why the app trusts the proxy

The backend sets `trustProxy: "127.0.0.1"`. Behind nginx every request arrives
from loopback, so without this `req.ip` is the same for everyone and the per-IP
rate limiter silently becomes a per-SITE limiter — 30 requests a minute shared by
the whole internet. We trust `X-Forwarded-For` **only** from 127.0.0.1, because a
client-settable header trusted from anywhere is just an IP-spoofing switch.

## Redeploying after a push

```bash
cd /var/www/confusecode.com
git pull
cd backend  && npm install && npm run build && npm run migrate
cd ../frontend && npm install && npm run build
sudo systemctl restart confusecode-backend confusecode-frontend
```

`npm run migrate` is idempotent — it applies only migrations not yet recorded in
`schema_migrations`, so running it on every deploy is correct and safe.

## When something is wrong

```bash
journalctl -u confusecode-backend  -f
journalctl -u confusecode-frontend -f
sudo ss -lntp | grep -E '3001|4000|5432'
```

**Sign-in silently does nothing.** Almost always `COOKIE_SECURE=true` while
you're browsing over plain HTTP — the browser drops `Secure` cookies on
insecure origins. Either use HTTPS or set it to `false` (dev only).

**OAuth returns `?auth=failed`.** The callback URL registered with GitHub/Google
must match `PUBLIC_ORIGIN` + `/api/auth/<provider>/callback` exactly, scheme and
all. The reason is never printed to the URL — it's in the journal:

```bash
journalctl -u confusecode-backend | grep oauth_failed
```

## Still to do

- **Backups.** There is now data worth owning (user identities and learning
  history). `pg_dump` on a schedule, off this box, with a **restore that has
  actually been tested**. An untested backup is a rumour.
- The other project on `*:3000` is bound to all interfaces, i.e. directly
  reachable from the internet rather than only through Caddy. Worth a look.
