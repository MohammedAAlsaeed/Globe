<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your settings for cross-origin resource sharing
    | or "CORS". This determines what cross-origin operations may execute
    | in web browsers. You are free to adjust these settings as needed.
    |
    | To learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
    |
    */

    // storage/*: locally served asset files (the editor draws them on a canvas).
    'paths' => ['api/*', 'sanctum/csrf-cookie', 'storage/*'],

    'allowed_methods' => ['*'],

    // The web app (Next.js). Credentials (session cookies) require an
    // explicit origin list — never '*'.
    'allowed_origins' => array_filter(explode(',', env('CORS_ALLOWED_ORIGINS', env('FRONTEND_URL', 'http://localhost:3000')))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    // Accept-Encoding: tells the web app it may send gzip request bodies
    // (RFC 7694), so it never compresses for an API that can't expand them.
    'exposed_headers' => ['Accept-Encoding'],

    'max_age' => 0,

    'supports_credentials' => true,

];
