# Domains and environments

Two copies of Al-Idrisi Atelier run on the internet, each built from its own branch:

| | develop (the team's copy) | production (customers) |
|---|---|---|
| Branch | `develop` | `master` |
| Web app | `https://idrisi.win` | `https://example.sa` (`www.` redirects to it) |
| API | `https://api.idrisi.win` | `https://api.example.sa` |
| Database | its own | its own |
| Files (R2 bucket) | `idrisi-dev` | `idrisi-prod` |
| Google sign-in | its own OAuth client | its own OAuth client |
| Search engines | closed (`noindex`, robots.txt disallows all) | open |
| Web app on | Cloudflare Worker `idrisi-app-develop` | Cloudflare Worker `idrisi-app` |
| Settings | [`env/*.develop.env.example`](env) | [`env/*.production.env.example`](env) |

**Our domains:** the develop copy is on **`idrisi.win`** (filled in under `env/*.develop.env.example`). The production domain, a `.sa` one, is still to be bought: `example.sa` stands for it in `env/*.production.env.example` (`example.com.sa` works the same). In the rest of this guide, `example.com` means whichever domain you are setting up.

**Each copy on its own domain.** The API and the web app share one domain so the sign-in cookies reach both (the cookie is set on `.example.com`). Never put one copy on a subdomain of the other (e.g. develop on `dev.example.sa`): its session and `XSRF-TOKEN` cookies would collide with the other's for anyone who uses both, causing sudden sign-outs and "page expired" errors. Separate domains also keep search results and email reputation apart.

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
| `example.com` | Worker custom domain | the web app's Worker (created by Cloudflare when you add the domain to it) |
| `www` | Worker custom domain | the same Worker (redirected by the rule above) |
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

1. Web app: on Cloudflare Workers (see [The web app on Cloudflare Workers](#the-web-app-on-cloudflare-workers) below), with the variables from `env/app.develop.env.example` for develop (branch `develop`) and `env/app.production.env.example` for production (branch `master`).
2. API host: the variables from `env/api.*.env.example`, secrets filled in.
3. On each API server:

   ```sh
   php artisan migrate --force
   php artisan db:seed --class=PlanSeeder --force
   php artisan idrisi:check-deploy
   ```

   `idrisi:check-deploy` checks what must agree for sign-in to work: the site and the API on one domain, the cookie domain covering both, Sanctum and CORS knowing the site, and the Google callback. It also checks https, debug mode, email and storage. It must end with **Ready**; it exits with an error otherwise, so a deploy script can stop there.
4. The first owner: sign up on the site, then `php artisan idrisi:make-admin you@example.com --role=owner`, and set up two-factor sign-in in the admin panel.

### The web app on Cloudflare Workers

The web app (`app/`) runs on Cloudflare Workers, built with OpenNext: on the same account as the domain, its DNS and the R2 buckets. Settings: `app/wrangler.jsonc` (the Worker's name, one per environment) and `app/open-next.config.ts` (pages are built once at deploy time and served from the Worker's static files).

**Connect the repository** (once per environment). Cloudflare → Workers & Pages → Create → Import a repository → `Globe`:

| | develop | production |
|---|---|---|
| Project name | `idrisi-app-develop` | `idrisi-app` |
| Production branch | `develop` | `master` |
| Root directory | `app` | `app` |
| Build command | `npx opennextjs-cloudflare build` | `npx opennextjs-cloudflare build` |
| Deploy command | `npx opennextjs-cloudflare deploy` | `npx opennextjs-cloudflare deploy -- --env production` |

The project name must match the Worker's name in `wrangler.jsonc`. Under **Settings → Build → Variables and secrets**, add the variables from `env/app.*.env.example`. They are needed at build time: the `NEXT_PUBLIC_` values are built into the site, so rebuild after changing them (Deployments → Retry). Then **Settings → Domains & Routes → Add → Custom domain**: `idrisi.win` (and `www.idrisi.win`, redirected by the rule in section 1). Cloudflare creates the DNS record and the certificate itself.

Every push to the branch then builds and publishes the site; a push to another branch builds a preview version with its own address.

**By hand**, from `app/`: `npm run preview` runs the built site locally in the Workers runtime; `npm run deploy` publishes the develop Worker (`npx wrangler login` once first).

**Size:** the Workers free plan takes a server bundle of up to 3 MiB compressed (10 MiB on the paid plan); the build shows it (`gzip:` in the deploy output). The site is about 1.8 MiB today: most of its code runs in the browser and doesn't count.

### The API on Laravel Cloud

The API (`api/`) runs on Laravel Cloud (plan Starter), region EU Central (Frankfurt). The develop copy is the application `idrisi-api`, environment `develop` (branch `develop`, pushes deploy it):

- **Compute:** Flex 512 MiB, scales to zero after 5 minutes; the scheduler on (`maps:purge-trashed` daily). No queue worker: nothing is queued yet.
- **Database:** Laravel MySQL 8.4, Dev size (sleeps when idle), attached to the environment: it injects `DB_*`, `SESSION_DRIVER` and `QUEUE_CONNECTION`.
- **Variables:** Settings → General → Custom environment variables: everything in `env/api.develop.env.example` except `DB_*`, with the secrets filled in (`APP_KEY` is generated by Cloud). The R2 keys are the bucket's own token (`idrisi-dev-api`: Object Read & Write on `idrisi-dev` only).
- **Build command:** `composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader` (the API has no front-end assets).
- **Deploy commands:** `php artisan migrate --force`, `php artisan db:seed --class=PlanSeeder --force`, `php artisan idrisi:check-deploy` (a deploy stops there if a setting is wrong).
- **Domain:** Settings → Network → Custom domains → `api.idrisi.win` ("managed by Cloudflare"); in Cloudflare DNS a `CNAME api → to.laravel.cloud`, **DNS only** (grey cloud).

## 6. After it is live

- Sign up, verify the email (check it isn't in spam), reset the password, sign in with Google: on both copies.
- `https://example.com/robots.txt` allows indexing; `https://example-dev.com/robots.txt` disallows everything.
- In Google Search Console, add the domain (DNS TXT verification) and submit `https://example.com/sitemap.xml`.
