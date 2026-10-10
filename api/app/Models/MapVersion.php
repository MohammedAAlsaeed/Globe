<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** An earlier revision of a map's document. */
#[Fillable(['revision', 'document_path', 'document_bytes', 'created_at'])]
class MapVersion extends Model
{
    public const UPDATED_AT = null;

    protected function casts(): array
    {
        return ['revision' => 'integer', 'document_bytes' => 'integer'];
    }

    public function map(): BelongsTo
    {
        return $this->belongsTo(Map::class);
    }
}
