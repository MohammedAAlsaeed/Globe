<?php

namespace App\Console\Commands;

use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * Checks a server's settings before (and after) it goes live: the domain
 * settings that must agree with each other for sign-in to work (the site,
 * the API, the session cookie, Sanctum, CORS, Google), https, debug mode,
 * email, storage, the database and the queue.
 *
 * Errors are settings that break the site or put it at risk; warnings are
 * worth a look. Exit code 1 when there is an error, so a deploy can stop.
 *
 *   php artisan idrisi:check-deploy
 */
#[Signature('idrisi:check-deploy')]
#[Description('Check the domain, security, email and storage settings of this server')]
class CheckDeploy extends Command
{
    /** @var list<array{0: string, 1: string, 2: string}> */
    private array $results = [];

    public function handle(): int
    {
        $live = ! in_array(config('app.env'), ['local', 'testing'], true);
        $app = $this->parse((string) config('app.url'));
        $site = $this->parse((string) config('idrisi.frontend_url'));

        // ---- addresses ----------------------------------------------------------------
        if (! $app || ! $site) {
            $this->add('error', 'Addresses', 'APP_URL and FRONTEND_URL must be full URLs (https://…).');

            return $this->report();
        }
        $local = $this->isLocal($app['host']) && $this->isLocal($site['host']);
        if ($live) {
            foreach (['APP_URL' => $app, 'FRONTEND_URL' => $site] as $name => $u) {
                $u['scheme'] === 'https'
                    ? $this->add('ok', 'Addresses', "{$name} is https.")
                    : $this->add('error', 'Addresses', "{$name} must be https on a live server.");
            }
        }
        if (! $local && $this->registrable($app['host']) !== $this->registrable($site['host'])) {
            $this->add('error', 'Addresses', "The site ({$site['host']}) and the API ({$app['host']}) must share one domain (e.g. example.com and api.example.com): the sign-in cookie can't cross domains.");
        }

        // ---- the session cookie -------------------------------------------------------------
        $domain = config('session.domain');
        if ($local) {
            $this->add('ok', 'Session cookie', 'Local: no cookie domain needed.');
        } elseif (! is_string($domain) || $domain === '' || $domain === 'null') {
            $this->add('error', 'Session cookie', 'SESSION_DOMAIN is not set: use the shared domain with a leading dot (e.g. .example.com).');
        } else {
            $d = ltrim(strtolower($domain), '.');
            $covers = fn (string $host) => $host === $d || str_ends_with($host, '.'.$d);
            $covers($app['host']) && $covers($site['host'])
                ? $this->add('ok', 'Session cookie', "SESSION_DOMAIN {$domain} covers the site and the API.")
                : $this->add('error', 'Session cookie', "SESSION_DOMAIN {$domain} must cover both {$site['host']} and {$app['host']}.");
        }
        if ($live) {
            config('session.secure')
                ? $this->add('ok', 'Session cookie', 'Sent over https only.')
                : $this->add('error', 'Session cookie', 'Set SESSION_SECURE_COOKIE=true.');
        }

        // ---- Sanctum and CORS ----------------------------------------------------------------
        $siteHost = $site['host'].($site['port'] ? ':'.$site['port'] : '');
        $stateful = array_map('trim', (array) config('sanctum.stateful'));
        in_array($siteHost, $stateful, true)
            ? $this->add('ok', 'Sanctum', "{$siteHost} gets session cookies.")
            : $this->add('error', 'Sanctum', "SANCTUM_STATEFUL_DOMAINS must include {$siteHost}.");
        $origin = $site['scheme'].'://'.$siteHost;
        $origins = array_map(fn ($o) => rtrim(trim($o), '/'), (array) config('cors.allowed_origins'));
        in_array($origin, $origins, true)
            ? $this->add('ok', 'CORS', "{$origin} may call the API.")
            : $this->add('error', 'CORS', "CORS_ALLOWED_ORIGINS (or FRONTEND_URL) must include {$origin}.");
        if (in_array('*', $origins, true)) {
            $this->add('error', 'CORS', "Never '*' with session cookies.");
        }

        // ---- the application -----------------------------------------------------------------
        if (! config('app.key')) {
            $this->add('error', 'App', 'APP_KEY is empty: run php artisan key:generate.');
        }
        if ($live) {
            config('app.debug')
                ? $this->add('error', 'App', 'APP_DEBUG must be false on a live server (it shows secrets in error pages).')
                : $this->add('ok', 'App', 'Debug off.');
            $proxies = config('idrisi.trusted_proxies');
            is_string($proxies) && $proxies !== ''
                ? $this->add('ok', 'App', 'Trusted proxies set.')
                : $this->add('warn', 'App', 'TRUSTED_PROXIES is empty: behind Cloudflare or a load balancer, set it (or *) so https and client IPs are seen.');
        }

        // ---- email ---------------------------------------------------------------------------
        $mailer = (string) config('mail.default');
        $from = (string) config('mail.from.address');
        if ($live && in_array($mailer, ['log', 'array'], true)) {
            $this->add('error', 'Email', "MAIL_MAILER={$mailer}: password-reset and verification emails are not sent.");
        } else {
            $this->add('ok', 'Email', "Mailer: {$mailer}.");
        }
        $fromDomain = strtolower(substr(strrchr($from, '@') ?: '', 1));
        if ($fromDomain === '' || str_ends_with($fromDomain, 'example.com')) {
            $this->add($live ? 'error' : 'warn', 'Email', 'MAIL_FROM_ADDRESS is not a real address on your domain.');
        } elseif (! $local && $fromDomain !== $this->registrable($site['host'])) {
            $this->add('warn', 'Email', "Emails come from {$fromDomain}, the site is {$site['host']}: use an address on the site's domain.");
        }

        // ---- Google sign-in ------------------------------------------------------------------
        if (config('services.google.client_id')) {
            $redirect = $this->parse((string) config('services.google.redirect'));
            $redirect && $redirect['host'] === $app['host']
                ? $this->add('ok', 'Google', 'The sign-in callback is on the API.')
                : $this->add('error', 'Google', 'GOOGLE_REDIRECT_URI must be on the API ('.$app['host'].'/auth/google/callback), and listed in the Google console.');
        }

        // ---- storage, database, queue ----------------------------------------------------------
        $disk = (string) config('regions.regions.'.config('regions.default').'.disk');
        if ($live && $disk === 'local') {
            $this->add('error', 'Storage', 'Files are on the server\'s own disk: set REGION_GLOBAL_DISK=s3 (Cloudflare R2 / S3).');
        } elseif (config("filesystems.disks.{$disk}.driver") === 's3') {
            $s3 = config("filesystems.disks.{$disk}");
            $missing = array_keys(array_filter([
                'AWS_ACCESS_KEY_ID' => ! ($s3['key'] ?? null),
                'AWS_SECRET_ACCESS_KEY' => ! ($s3['secret'] ?? null),
                'AWS_BUCKET' => ! ($s3['bucket'] ?? null),
            ]));
            $missing
                ? $this->add('error', 'Storage', 'Missing: '.implode(', ', $missing).'.')
                : $this->add('ok', 'Storage', "S3 bucket {$s3['bucket']}.");
        } else {
            $this->add('ok', 'Storage', "Disk: {$disk}.");
        }
        $db = (string) config('database.default');
        if ($live && $db === 'sqlite') {
            $this->add('warn', 'Database', 'SQLite on a live server: its file is lost on every deploy. Attach a MySQL or PostgreSQL database.');
        }
        $queue = (string) config('queue.default');
        if ($live && $queue === 'sync') {
            $this->add('warn', 'Queue', 'QUEUE_CONNECTION=sync: emails are sent while the visitor waits. Run a queue worker.');
        }

        return $this->report();
    }

    private function add(string $level, string $area, string $message): void
    {
        $this->results[] = [$level, $area, $message];
    }

    private function report(): int
    {
        $marks = ['ok' => '<fg=green>✓</>', 'warn' => '<fg=yellow>!</>', 'error' => '<fg=red>✗</>'];
        $this->table(['', 'Area', ''], array_map(
            fn ($r) => [$marks[$r[0]], $r[1], $r[2]],
            $this->results,
        ));
        $errors = count(array_filter($this->results, fn ($r) => $r[0] === 'error'));
        $warnings = count(array_filter($this->results, fn ($r) => $r[0] === 'warn'));
        if ($errors) {
            $this->error("{$errors} error(s), {$warnings} warning(s).");

            return self::FAILURE;
        }
        $this->info($warnings ? "Ready, with {$warnings} warning(s)." : 'Ready.');

        return self::SUCCESS;
    }

    /** @return array{scheme: string, host: string, port: ?int}|null */
    private function parse(string $url): ?array
    {
        $p = parse_url(rtrim($url, '/'));
        if (! is_array($p) || empty($p['scheme']) || empty($p['host'])) {
            return null;
        }

        return ['scheme' => strtolower($p['scheme']), 'host' => strtolower($p['host']), 'port' => $p['port'] ?? null];
    }

    private function isLocal(string $host): bool
    {
        return in_array($host, ['localhost', '127.0.0.1', '::1'], true) || str_ends_with($host, '.test');
    }

    /** The domain a cookie can be shared on: the last two labels, or three
     * for country domains like example.com.sa / example.co.uk. */
    private function registrable(string $host): string
    {
        $parts = explode('.', $host);
        $n = count($parts);
        if ($n <= 2) {
            return $host;
        }
        $second = $parts[$n - 2];
        $take = strlen($parts[$n - 1]) === 2 && in_array($second, ['com', 'net', 'org', 'co', 'edu', 'gov', 'ac', 'sch', 'med'], true) ? 3 : 2;

        return implode('.', array_slice($parts, -$take));
    }
}
