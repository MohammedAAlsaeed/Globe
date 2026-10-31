# Domains and environments

Two copies of Al-Idrisi Atelier run on the internet, each built from its own branch:

| | develop (the team's copy) | production (customers) |
|---|---|---|
| Branch | `develop` | `master` |
| Web app | `https://example-dev.com` | `https://idrisi.win` (`www.` redirects to it) |
| API | `https://api.example-dev.com` | `https://api.idrisi.win` |
| Database | its own | its own |
| Files (R2 bucket) | `idrisi-dev` | `idrisi-prod` |
| Google sign-in | its own OAuth client | its own OAuth client |
| Search engines | closed (`noindex`, robots.txt disallows all) | open |
| Settings | [`env/*.develop.env.example`](env) | [`env/*.production.env.example`](env) |

**Our domains:** production is **`idrisi.win`** (filled in under `env/*.production.env.example`). The develop domain is still to be chosen: `example-dev.com` below and in `env/*.develop.env.example` stands for it. In the rest of this guide, `example.com` means `idrisi.win`.

**Why a second domain for develop.** The API and the web app share one domain so the sign-in cookies reach both (the cookie is set on `.example.com`). A develop copy on `dev.example.com` would sit under that same cookie domain: its session and `XSRF-TOKEN` cookies would collide with the real site's for anyone who uses both, causing sudden sign-outs and "page expired" errors. A second, cheap domain keeps the two copies fully apart (cookies, search results, email reputation).

## 1. The domain

- **Registrar:** Cloudflare Registrar (sold at cost, no renewal mark-up, DNS included). Otherwise any registrar, with the DNS moved to Cloudflare (change the nameservers).
- **Lock it down:** turn on two-factor sign-in for the registrar account, auto-renew, the registrar lock, and WHOIS privacy (Cloudflare does both by default). Use an email address you will always control for the account, not one on the new domain.
- **One canonical address:** the site lives on the bare domain (`example.com`); `www.example.com` redirects to it (Cloudflare → Rules → Redirect Rules, 301).

## 2. Cloudflare settings (both domains)

- SSL/TLS → mode **Full (strict)**; **Always Use HTTPS** on; minimum TLS 1.2.
- Turn on **HSTS** only once everything works over https (the web app sends it itself on production).
- DNS records for the site and the API: as your hosts tell you when you add the custom domain (usually a `CNAME`; the apex uses Cloudflare's CNAME flattening). Proxy (orange cloud) on, unless the host asks for DNS only.
- The API then sees Cloudflare, not the visitor: `TRUSTED_PROXIES=*` in its settings (already in the templates).

| Name | Type | Points to |
|---|---|---|
| `example.com` | CNAME (flattened) / A | web app host (production) |
| `www` | CNAME | `example.com` (redirected by the rule above) |
| `api` | CNAME | API host (production) |
| `assets` *(later)* | R2 custom domain | bucket `idrisi-prod`, for public stamp files |

The develop domain gets the same records pointing at the develop deployments.

## 3. Email on the domain

Two different things:

1. **Mailboxes for people** (`hello@`, `support@`): Google Workspace or Zoho Mail. Their setup screen gives the `MX` records and a TXT record to add in Cloudflare.
2. **Emails the API sends** (verification, password reset): a transactional sender, e.g. Resend, Postmark or Amazon SES. Add the domain there; it gives `SPF` and `DKIM` records to add. The API sends with SMTP (see `MAIL_*` in the templates); the from address is `no-reply@example.com`.

Then add DMARC, starting in report-only mode:

| Name | Type | Value |
|---|---|---|
| `_dmarc` | TXT | `v=DMARC1; p=none; rua=mailto:dmarc@example.com` |

After a few weeks of clean reports, change `p=none` to `p=quarantine`.

**Only one SPF record per domain:** if both the mailbox provider and the sender need SPF, combine them into one `TXT` (`v=spf1 include:_spf.google.com include:… ~all`).

## 4. Google sign-in

In Google Cloud Console → APIs & Services → Credentials, one OAuth client per environment:

- Authorized redirect URIs: `https://api.example.com/auth/google/callback`.
- OAuth consent screen: app name, the support email, the home page, privacy policy and terms links on the domain, and the domain under "Authorized domains".

## 5. Settings and the check

1. Web app host (e.g. Vercel): set the variables from `env/app.production.env.example` for production (branch `master`) and `env/app.develop.env.example` for develop (branch `develop`). `NEXT_PUBLIC_` values are built into the site: redeploy after changing them.
2. API host: the variables from `env/api.*.env.example`, secrets filled in.
3. On each API server:

   ```sh
   php artisan migrate --force
   php artisan db:seed --class=PlanSeeder --force
   php artisan idrisi:check-deploy
   ```

   `idrisi:check-deploy` checks what must agree for sign-in to work: the site and the API on one domain, the cookie domain covering both, Sanctum and CORS knowing the site, and the Google callback. It also checks https, debug mode, email and storage. It must end with **Ready**; it exits with an error otherwise, so a deploy script can stop there.
4. The first owner: sign up on the site, then `php artisan idrisi:make-admin you@example.com --role=owner`, and set up two-factor sign-in in the admin panel.

## 6. After it is live

- Sign up, verify the email (check it isn't in spam), reset the password, sign in with Google: on both copies.
- `https://example.com/robots.txt` allows indexing; `https://example-dev.com/robots.txt` disallows everything.
- In Google Search Console, add the domain (DNS TXT verification) and submit `https://example.com/sitemap.xml`.
