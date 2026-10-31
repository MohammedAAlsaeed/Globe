<?php

/*
| Application settings for Al-Idrisi Atelier.
*/

return [

    // Where the web app lives: links in emails and OAuth redirects go here.
    'frontend_url' => rtrim(env('FRONTEND_URL', 'http://localhost:3000'), '/'),

    // The load balancers / proxies in front of the API (Cloudflare, the
    // host's own): '*' trusts whoever connects (fine when only the proxy can
    // reach the server), or a comma-separated list of IPs / CIDR ranges.
    // Without it the API thinks every request is plain http from the proxy:
    // wrong links in emails, rate limits shared by everyone.
    'trusted_proxies' => env('TRUSTED_PROXIES'),

    // Interface languages the web app ships.
    'locales' => ['ar', 'en'],

    'maps' => [
        // Largest accepted map document (uncompressed JSON), in bytes.
        'max_document_bytes' => (int) env('MAP_MAX_DOCUMENT_BYTES', 20 * 1024 * 1024),
        // Earlier revisions kept per map for restore.
        'keep_versions' => (int) env('MAP_KEEP_VERSIONS', 20),
        'max_thumbnail_kb' => 2048,
    ],

    'admin' => [
        // How long one two-factor code keeps the admin panel open.
        'two_factor_hours' => (int) env('ADMIN_TWO_FACTOR_HOURS', 12),
        // Sensitive changes (roles, plans, deleting people) need a code this recent.
        'step_up_minutes' => (int) env('ADMIN_STEP_UP_MINUTES', 10),
        // The name authenticator apps show next to the account.
        'issuer' => env('ADMIN_TWO_FACTOR_ISSUER', 'Al-Idrisi Atelier'),
    ],

    'assets' => [
        'max_upload_kb' => 10240,
        // Minutes a signed asset URL stays valid.
        'url_ttl' => 60,
    ],

];
