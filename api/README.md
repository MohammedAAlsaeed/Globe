# Al-Idrisi Atelier — API

The backend for the map creator: accounts, cloud-saved maps, the asset library and subscription plans. Laravel 13, PostgreSQL and S3-compatible object storage. The web app (`../app`, Next.js) talks to it over `/api/v1`, signed in with Sanctum's cookie-based SPA sessions.

## Local setup (macOS)

You need PHP 8.3 or newer, Composer, and PostgreSQL 15 or newer. Files are stored on the local disk (`storage/app/private`) in development, so no S3 service has to run.

```sh
# 1. Database (Homebrew Postgres: your macOS user, no password)
createdb idrisi

# 2. The API
cd api
composer setup          # install, .env, key, migrate and seed the plans
composer dev            # http://localhost:8000
```

Set `DB_USERNAME` in `.env` to your Postgres user (with Homebrew, that's the output of `whoami`), then run `php artisan migrate --seed` if `composer setup` stopped at the migration step.

To use real S3-compatible storage (Cloudflare R2, AWS S3, or a self-hosted SeaweedFS or Garage), set `REGION_GLOBAL_DISK=s3` and fill in the `AWS_*` values. The code is the same for every disk.

Run the web app on `http://localhost:3000` (`FRONTEND_URL`). Both run on `localhost`, so session cookies work without extra setup.

### Tests

```sh
composer test           # SQLite in memory; no services needed
```

To run the suite on Postgres instead:

```sh
createdb idrisi_test
DB_CONNECTION=pgsql DB_DATABASE=idrisi_test php artisan test
```

### Useful commands

```sh
php artisan idrisi:make-admin you@example.com                    # platform admin
php artisan idrisi:grant-plan you@example.com atlas --days=30     # give a plan without payment
php artisan maps:purge-trashed                                    # runs daily from the scheduler
```

## How it is organised

| Area | Where |
|---|---|
| Routes | `routes/api.php` (`/api/v1/...`), `routes/web.php` (Google sign-in redirects) |
| Accounts | `app/Http/Controllers/Api/V1/Auth/*`, `app/Http/Controllers/Auth/GoogleController.php` |
| Maps | `MapController`, `app/Services/MapDocuments.php` |
| Plans and limits | `plans` table (seeded by `PlanSeeder`), `app/Services/Entitlements.php` |
| Asset library | `AssetPackController`, `AssetController`, `AssetPackPolicy` |
| Data regions | `config/regions.php`, `app/Services/Regions.php` |
| App settings | `config/idrisi.php` |

### Key decisions

- **Role is not the plan.** `users.role` (`user` / `admin`) is about the platform. The plan comes from the user's current subscription, or the default plan when there is none.
- **Limits live in the database.** Change a plan's limits in `PlanSeeder` and re-run `php artisan db:seed --class=PlanSeeder`. `null` means unlimited.
- **Limits are enforced on the server.** `Entitlements` checks every one of them. A downgrade never deletes anything: over the map limit, existing maps stay editable and only new ones are blocked.
- **Map documents live in object storage.** Each revision is written to `maps/{user}/{map}/r{n}.json.gz` (gzip JSON). Postgres keeps only the metadata. The 20 most recent earlier revisions are kept for restore.
- **No silent overwrites.** A save (`PUT /maps/{id}`) must send the `revision` it was based on. A stale revision gets `409 revision_conflict` with the current revision.
- **The document is stored exactly as sent.** It is re-encoded from the raw JSON body, so `{}` stays `{}` and Arabic text stays as-is. The server only checks the outline; the editor validates the full document when it loads it.
- **Exports are recorded with their license.** Each export stores the plan in force at that time. A map exported under a commercial plan stays licensed after a downgrade.
- **Regions.** Every user has a `region`. Their files go to that region's disk. To add a region (for example, for data-residency rules), add an S3 disk in `config/filesystems.php` and an entry in `config/regions.php`.
- **Stamp sets.** Assets of a pack sharing a `set_key` are variants of one stamp; the Stamp Tool places them at random. Official assets also carry a `category` (terrain, vegetation, settlements, water, symbols) for the catalog.
- **Uploads on every plan.** Explorer can upload 20 MB of its own stamps, Cartographer 500 MB, Atlas 5 GB (`upload_quota_bytes`). After changing limits, re-run the plan seeder.
- **Placed stamps always draw.** A map keeps drawing stamps from a pack the plan no longer includes (`GET assets?ids[]=`); only placing new ones is refused.
- **Errors carry a `code`.** Domain errors are JSON shaped as `{ message, code, ... }`, with codes `plan_limit_reached` (plus `limit` and `max`) and `revision_conflict`, so the web app can show translated messages.

## API overview (`/api/v1`)

The web app first calls `GET /sanctum/csrf-cookie`, then sends the `XSRF-TOKEN` cookie back as the `X-XSRF-TOKEN` header, with `credentials: "include"`.

| Method | Path | |
|---|---|---|
| POST | `auth/register`, `auth/login`, `auth/logout` | Session sign-in |
| GET / PATCH | `auth/me` | User, plan and usage; edit name and locale |
| POST | `auth/forgot-password`, `auth/reset-password` | The reset email links to `FRONTEND_URL/reset-password` |
| POST | `auth/email/verification-notification` | Resend verification |
| GET | `/auth/google/redirect` (web route) | Continue with Google → back to `FRONTEND_URL/auth/callback` |
| GET / POST | `maps` | List (with `limits`), create |
| GET / PUT / PATCH / DELETE | `maps/{id}` | Read (metadata + `document`), save (needs `revision`), rename, trash |
| POST | `maps/{id}/thumbnail` | Gallery preview (png / webp / jpeg) |
| POST | `maps/{id}/exports` | Check the export size against the plan; record the license |
| GET / POST | `asset-packs` | Library (with `locked`); create your own pack (admins: `official: true`) |
| PATCH / DELETE | `asset-packs/{id}` | Manage a pack |
| GET / POST | `asset-packs/{id}/assets` | List (short-lived URLs) / upload (png / webp / jpeg, within quota; optional `set_key`, and `category` for official packs) |
| GET | `assets?ids[]=…` | Assets by id, to draw maps that use them (even from a pack now above the plan) |
| PATCH / DELETE | `assets/{id}` | Rename, move to another set, re-file (official) / remove |

## Production checklist

- `APP_ENV=production`, `APP_DEBUG=false`, and HTTPS everywhere.
- The site and the API share one parent domain, for example `example.com` and `api.example.com`:
  - `SESSION_DOMAIN=.example.com`
  - `SANCTUM_STATEFUL_DOMAINS=example.com`
  - `FRONTEND_URL=https://example.com`
- A real mail driver for verification and reset emails.
- Storage: `REGION_GLOBAL_DISK=s3`, with AWS S3 or Cloudflare R2 (set `AWS_ENDPOINT` for R2) and a private bucket.
- Bucket CORS: allow `GET` from the site's origin. The editor draws stamp images on a canvas (and prints it), which browsers only allow for images served with CORS headers. Locally, `config/cors.php` covers `storage/*`.
- Run `php artisan schedule:run` every minute (cron) and a queue worker.
