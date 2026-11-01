<?php

namespace App\Services;

use GuzzleHttp\Psr7\Uri;
use Illuminate\Filesystem\AwsS3V3Adapter;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * Signed URLs for private files (thumbnails, uploaded stamps): on S3 / R2
 * signed with a fixed start time per window, so the same file gets the
 * same URL for the whole window and the browser can keep it in its cache
 * instead of downloading it again on every page (a fresh signature each
 * time would make every URL new). Stored paths never change content (a new
 * upload gets a new path), so a cached copy is never stale.
 *
 * With a 12-hour window and 12 hours of grace, a URL handed out is always
 * valid for at least 12 hours, at most 24.
 */
class FileUrls
{
    /** How browsers may keep private files: their paths never change content. */
    public const CACHE_CONTROL = 'private, max-age=86400, immutable';

    public function temporary(string $disk, ?string $path): ?string
    {
        if ($path === null) {
            return null;
        }
        $storage = Storage::disk($disk);
        if ($storage instanceof AwsS3V3Adapter) {
            return $this->signed($storage, $path);
        }
        try {
            $minutes = (int) config('idrisi.assets.url_ttl');

            return $storage->temporaryUrl($path, now()->addMinutes($minutes));
        } catch (RuntimeException) {
            // Disks without signed URLs (e.g. test fakes) fall back to a plain URL.
            return $storage->url($path);
        }
    }

    /**
     * The start and end (Unix seconds) of the window a URL signed now uses.
     *
     * @return array{int, int}
     */
    public static function window(?int $now = null): array
    {
        $now ??= now()->getTimestamp();
        $window = max(60, (int) config('idrisi.assets.url_window_minutes') * 60);
        $grace = max(60, (int) config('idrisi.assets.url_grace_minutes') * 60);
        $start = intdiv($now, $window) * $window;

        return [$start, $start + $window + $grace];
    }

    private function signed(AwsS3V3Adapter $storage, string $path): string
    {
        [$start, $expires] = self::window();
        $config = $storage->getConfig();
        $client = $storage->getClient();
        $command = $client->getCommand('GetObject', [
            'Bucket' => $config['bucket'],
            'Key' => $storage->path($path),
            // Uploads stored before Cache-Control was set get it this way.
            // Fixed (never time-dependent), or the URL would change.
            'ResponseCacheControl' => self::CACHE_CONTROL,
        ]);
        $uri = $client->createPresignedRequest($command, $expires, ['start_time' => $start])->getUri();

        if (isset($config['temporary_url'])) {
            $base = new Uri($config['temporary_url']);
            $uri = $uri->withScheme($base->getScheme())->withHost($base->getHost())->withPort($base->getPort());
        }

        return (string) $uri;
    }
}
