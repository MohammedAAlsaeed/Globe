<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Facades\Storage;

/** Data regions (config/regions.php): which storage disk holds whose files. */
class Regions
{
    /** A valid region code: the requested one if configured, else the default. */
    public function resolve(?string $requested): string
    {
        $regions = config('regions.regions');

        return $requested !== null && isset($regions[$requested])
            ? $requested
            : config('regions.default');
    }

    public function diskName(User $user): string
    {
        return config('regions.regions.'.$this->resolve($user->region).'.disk');
    }

    public function disk(User $user): Filesystem
    {
        return Storage::disk($this->diskName($user));
    }
}
