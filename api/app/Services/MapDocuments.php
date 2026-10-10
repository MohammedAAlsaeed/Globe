<?php

namespace App\Services;

use App\Models\Map;
use App\Models\MapVersion;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Stores map documents: gzip-compressed JSON on the owner's region disk,
 * one immutable file per revision, so a save never overwrites the file a
 * reader may be fetching, and older revisions can be restored.
 *
 *   maps/{user}/{map}/r{revision}.json.gz
 */
class MapDocuments
{
    public function __construct(private Regions $regions) {}

    /** Creates a map with its first revision. */
    public function create(User $user, array $attributes, string $json): Map
    {
        $map = new Map($attributes);
        $map->user()->associate($user);
        $map->disk = $this->regions->diskName($user);
        $map->revision = 1;
        // The id is needed for the path before the row exists.
        $map->id = $map->newUniqueId();
        $this->write($map, $json);

        $map->save();

        return $map;
    }

    /**
     * Saves a new revision. The caller has already checked that the client
     * edited the current revision; the row lock closes the remaining race.
     */
    public function update(Map $map, string $json, array $attributes = []): Map
    {
        return DB::transaction(function () use ($map, $json, $attributes) {
            $locked = Map::query()->lockForUpdate()->findOrFail($map->id);

            $locked->versions()->create([
                'revision' => $locked->revision,
                'document_path' => $locked->document_path,
                'document_bytes' => $locked->document_bytes,
                'created_at' => now(),
            ]);

            $locked->fill($attributes);
            $locked->revision++;
            $this->write($locked, $json);
            $locked->save();

            $this->prune($locked);

            return $locked;
        });
    }

    /** The current document as a JSON string. */
    public function read(Map $map): string
    {
        return gzdecode(Storage::disk($map->disk)->get($map->document_path));
    }

    /** Deletes every file of a map (after the row is gone for good). */
    public function purge(Map $map): void
    {
        Storage::disk($map->disk)->deleteDirectory($this->directory($map));
    }

    private function write(Map $map, string $json): void
    {
        $path = $this->directory($map)."/r{$map->revision}.json.gz";
        Storage::disk($map->disk)->put($path, gzencode($json, 6), [
            'ContentType' => 'application/json',
            'ContentEncoding' => 'gzip',
        ]);
        $map->document_path = $path;
        $map->document_bytes = strlen($json);
    }

    /** Keeps only the newest N earlier revisions. */
    private function prune(Map $map): void
    {
        $keep = config('idrisi.maps.keep_versions');
        $old = $map->versions()->orderByDesc('revision')->skip($keep)->take(PHP_INT_MAX)->get();
        foreach ($old as $version) {
            /** @var MapVersion $version */
            Storage::disk($map->disk)->delete($version->document_path);
            $version->delete();
        }
    }

    private function directory(Map $map): string
    {
        return "maps/{$map->user_id}/{$map->id}";
    }
}
