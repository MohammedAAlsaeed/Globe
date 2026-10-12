<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

/**
 * One stamp or texture image. Stamps sharing a `set_key` in a pack are
 * variants of one stamp set.
 */
#[Fillable(['name', 'set_key', 'category', 'tags', 'disk', 'path', 'mime', 'bytes', 'width', 'height'])]
#[Hidden(['disk', 'path'])]
class Asset extends Model
{
    use HasUlids;

    protected function casts(): array
    {
        return ['tags' => 'array', 'bytes' => 'integer', 'width' => 'integer', 'height' => 'integer'];
    }

    /** Removes the row and its stored file. */
    public function deleteWithFile(): void
    {
        Storage::disk($this->disk)->delete($this->path);
        $this->delete();
    }

    public function pack(): BelongsTo
    {
        return $this->belongsTo(AssetPack::class, 'pack_id');
    }
}
