<?php

namespace App\Services;

use Illuminate\Support\Facades\Storage;
use RuntimeException;

/** Short-lived URLs for private files (signed on S3, served locally in dev). */
class FileUrls
{
    public function temporary(string $disk, ?string $path): ?string
    {
        if ($path === null) {
            return null;
        }
        $minutes = config('idrisi.assets.url_ttl');
        try {
            return Storage::disk($disk)->temporaryUrl($path, now()->addMinutes($minutes));
        } catch (RuntimeException) {
            // Disks without signed URLs (e.g. test fakes) fall back to a plain URL.
            return Storage::disk($disk)->url($path);
        }
    }
}
