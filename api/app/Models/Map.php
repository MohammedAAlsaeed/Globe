<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A saved map. Only metadata lives in the database; the document itself is
 * a compressed JSON file per revision (see App\Services\MapDocuments).
 *
 * @property string $disk
 * @property string $document_path
 * @property int $revision
 */
#[Fillable(['name', 'width', 'height', 'schema_version', 'revision', 'disk', 'document_path', 'document_bytes', 'thumbnail_path'])]
#[Hidden(['disk', 'document_path', 'thumbnail_path'])]
class Map extends Model
{
    use HasFactory, HasUlids, SoftDeletes;

    protected function casts(): array
    {
        return [
            'width' => 'integer',
            'height' => 'integer',
            'schema_version' => 'integer',
            'revision' => 'integer',
            'document_bytes' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function versions(): HasMany
    {
        return $this->hasMany(MapVersion::class);
    }
}
