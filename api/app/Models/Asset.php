<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Storage;

/**
 * One stamp or texture image. Stamps sharing a `set_key` in a pack are
 * variants of one stamp set.
 *
 * Staff can move an asset to the trash (soft delete): it is gone for
 * everyone at once, restorable for 30 days, then purged with its file.
 * A person deleting their own upload removes it for good straight away.
 */
#[Fillable(['name', 'set_key', 'category', 'tags', 'disk', 'path', 'mime', 'bytes', 'width', 'height'])]
#[Hidden(['disk', 'path'])]
class Asset extends Model
{
    use HasUlids, SoftDeletes;

    protected function casts(): array
    {
        return ['tags' => 'array', 'bytes' => 'integer', 'width' => 'integer', 'height' => 'integer'];
    }

    /** Removes the row and its stored file, for good (also from the trash). */
    public function deleteWithFile(): void
    {
        Storage::disk($this->disk)->delete($this->path);
        $this->forceDelete();
    }

    public function pack(): BelongsTo
    {
        return $this->belongsTo(AssetPack::class, 'pack_id');
    }
}
