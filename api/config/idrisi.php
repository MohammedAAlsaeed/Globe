<?php

/*
| Application settings for Al-Idrisi Atelier.
*/

return [

    // Where the web app lives: links in emails and OAuth redirects go here.
    'frontend_url' => rtrim(env('FRONTEND_URL', 'http://localhost:3000'), '/'),

    // Interface languages the web app ships.
    'locales' => ['ar', 'en'],

    'maps' => [
        // Largest accepted map document (uncompressed JSON), in bytes.
        'max_document_bytes' => (int) env('MAP_MAX_DOCUMENT_BYTES', 20 * 1024 * 1024),
        // Earlier revisions kept per map for restore.
        'keep_versions' => (int) env('MAP_KEEP_VERSIONS', 20),
        'max_thumbnail_kb' => 2048,
    ],

    'assets' => [
        'max_upload_kb' => 10240,
        // Minutes a signed asset URL stays valid.
        'url_ttl' => 60,
    ],

];
