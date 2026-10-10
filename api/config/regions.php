<?php

/*
| Data regions. Every account belongs to one region, and its maps and
| uploads are stored on that region's disk (config/filesystems.php). Start
| with one region; adding another (e.g. for a market with data-residency
| rules) is a new disk plus an entry here — no code changes.
*/

return [

    'default' => env('DATA_REGION', 'global'),

    'regions' => [
        'global' => [
            'disk' => env('REGION_GLOBAL_DISK', 's3'),
        ],
    ],

];
