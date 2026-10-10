<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One export of a map, with the license terms in force when it was made. */
#[Fillable(['map_id', 'plan_code', 'width', 'height', 'commercial_use'])]
class Export extends Model
{
    public const UPDATED_AT = null;

    protected function casts(): array
    {
        return ['width' => 'integer', 'height' => 'integer', 'commercial_use' => 'boolean'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function map(): BelongsTo
    {
        return $this->belongsTo(Map::class);
    }
}
