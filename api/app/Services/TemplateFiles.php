<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Asset;
use App\Models\Map;
use App\Models\MapTemplate;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * The files of an official template: a copy of a map's document (gzip JSON)
 * and of its thumbnail, on the default region's disk.
 *
 *   templates/{template}/{ulid}.json.gz
 *   templates/{template}/{ulid}.{png|webp|jpg}
 *
 * Paths never change content (a new copy gets a new path), so signed URLs
 * can be cached like every other private file.
 */
class TemplateFiles
{
    public function __construct(private MapDocuments $documents) {}

    public static function disk(): string
    {
        return (string) config('regions.regions.'.config('regions.default').'.disk');
    }

    /**
     * Copies the map's current document and thumbnail into the template
     * (not saved here). Everyone must be able to draw the copy, so a map
     * that uses someone's personal uploads is refused.
     */
    public function copyFromMap(MapTemplate $template, Map $map): void
    {
        $json = $this->documents->read($map);
        $private = $this->privateAssets($json);
        if ($private > 0) {
            throw new ApiException(
                'template_private_assets',
                'The map uses personal uploads; only built-in and published official art can be in a template.',
                422,
                ['count' => $private],
            );
        }

        $old = [$template->document_path, $template->thumbnail_path];
        $disk = $template->disk ?: self::disk();
        $dir = "templates/{$template->id}";
        $path = "{$dir}/".Str::ulid().'.json.gz';
        Storage::disk($disk)->put($path, gzencode($json, 6), ['ContentType' => 'application/gzip']);

        $thumb = null;
        if ($map->thumbnail_path && Storage::disk($map->disk)->exists($map->thumbnail_path)) {
            $ext = pathinfo($map->thumbnail_path, PATHINFO_EXTENSION) ?: 'webp';
            $thumb = "{$dir}/".Str::ulid().".{$ext}";
            Storage::disk($disk)->put($thumb, Storage::disk($map->disk)->get($map->thumbnail_path), [
                'CacheControl' => FileUrls::CACHE_CONTROL,
            ]);
        }

        $template->disk = $disk;
        $template->document_path = $path;
        $template->document_bytes = strlen($json);
        $template->thumbnail_path = $thumb;
        $template->width = $map->width;
        $template->height = $map->height;

        foreach (array_filter($old) as $stale) {
            Storage::disk($disk)->delete($stale);
        }
    }

    /** The template's document as a JSON string. */
    public function read(MapTemplate $template): string
    {
        $stored = (string) Storage::disk($template->disk)->get($template->document_path);
        if (! str_starts_with($stored, "\x1f\x8b")) {
            return $stored;
        }
        $json = gzdecode($stored);
        if ($json === false) {
            throw new RuntimeException("Template document {$template->document_path} is not valid gzip.");
        }

        return $json;
    }

    /** Deletes every file of a template (after the row is gone for good). */
    public function purge(MapTemplate $template): void
    {
        Storage::disk($template->disk)->deleteDirectory("templates/{$template->id}");
    }

    /**
     * How many uploaded assets the document places ("u:<asset id>" keys)
     * that are not in the published official library.
     */
    private function privateAssets(string $json): int
    {
        preg_match_all('/"u:([0-9A-Za-z]{26})"/', $json, $m);
        $ids = array_values(array_unique(array_map('strtolower', $m[1])));
        if ($ids === []) {
            return 0;
        }
        $official = 0;
        foreach (array_chunk($ids, 500) as $chunk) {
            $official += Asset::query()
                ->whereIn('id', $chunk)
                ->whereHas('pack', fn ($q) => $q->whereNull('owner_id')->where('published', true))
                ->count();
        }

        return count($ids) - $official;
    }
}
