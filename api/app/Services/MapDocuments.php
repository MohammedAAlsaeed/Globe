<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Map;
use App\Models\MapVersion;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

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

    /**
     * A map this person already created with this save id: the same upload
     * sent again because its answer was lost.
     */
    public function createdBy(User $user, ?string $saveId): ?Map
    {
        return $saveId === null ? null : Map::query()
            ->where('user_id', $user->id)
            ->where('last_save_id', $saveId)
            ->first();
    }

    /** Creates a map with its first revision. */
    public function create(User $user, array $attributes, string $json, ?string $saveId = null): Map
    {
        $map = new Map($attributes);
        $map->user()->associate($user);
        $map->disk = $this->regions->diskName($user);
        $map->revision = 1;
        $map->last_save_id = $saveId;
        // The id is needed for the path before the row exists.
        $map->id = $map->newUniqueId();
        $this->write($map, $json);

        $map->save();

        return $map;
    }

    /**
     * Saves a new revision on top of `$basedOn`, the revision the editor
     * started from. Checked under the row lock, so two saves arriving
     * together can't both pass: the second gets a conflict (409) instead of
     * silently replacing the first.
     *
     * The save that already made the current revision (same `$saveId`, sent
     * again because its answer was lost) gets that revision back unchanged.
     */
    public function update(Map $map, string $json, array $attributes, int $basedOn, ?string $saveId = null): Map
    {
        return DB::transaction(function () use ($map, $json, $attributes, $basedOn, $saveId) {
            $locked = Map::query()->lockForUpdate()->findOrFail($map->id);
            if ($saveId !== null && $locked->last_save_id === $saveId && $locked->revision === $basedOn + 1) {
                return $locked;
            }
            if ($locked->revision !== $basedOn) {
                throw ApiException::revisionConflict($locked->revision, $locked->last_save_id);
            }

            $locked->versions()->create([
                'revision' => $locked->revision,
                'document_path' => $locked->document_path,
                'document_bytes' => $locked->document_bytes,
                'created_at' => now(),
            ]);

            $locked->fill($attributes);
            $locked->revision++;
            $locked->last_save_id = $saveId;
            $this->write($locked, $json);
            $locked->save();

            $this->prune($locked);

            return $locked;
        });
    }

    /**
     * The current document as a JSON string. Files are gzip, but one written
     * with a `Content-Encoding: gzip` header (as earlier versions did) comes
     * back from S3 / R2 already decompressed by the HTTP client: both work.
     */
    public function read(Map $map): string
    {
        $stored = (string) Storage::disk($map->disk)->get($map->document_path);
        if (! str_starts_with($stored, "\x1f\x8b")) {
            return $stored;
        }
        $json = gzdecode($stored);
        if ($json === false) {
            throw new RuntimeException("Map document {$map->document_path} is not valid gzip.");
        }

        return $json;
    }

    /** Deletes every file of a map (after the row is gone for good). */
    public function purge(Map $map): void
    {
        Storage::disk($map->disk)->deleteDirectory($this->directory($map));
    }

    private function write(Map $map, string $json): void
    {
        $path = $this->directory($map)."/r{$map->revision}.json.gz";
        // A plain gzip file, not `Content-Encoding: gzip`: with that header the
        // HTTP client decompresses it on the way back, behind our back.
        Storage::disk($map->disk)->put($path, gzencode($json, 6), [
            'ContentType' => 'application/gzip',
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
