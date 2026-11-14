<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * An official starting map: a copy of a map document that anyone whose plan
 * reaches `tier` can start a new map from. Made by staff from one of their
 * own maps (see Admin\TemplateController).
 *
 * @property string $disk
 * @property string $document_path
 */
#[Fillable(['name', 'name_ar', 'tier', 'published', 'sort'])]
#[Hidden(['disk', 'document_path', 'thumbnail_path'])]
class MapTemplate extends Model
{
    use HasUlids, SoftDeletes;

    protected function casts(): array
    {
        return [
            'width' => 'integer',
            'height' => 'integer',
            'document_bytes' => 'integer',
            'tier' => 'integer',
            'published' => 'boolean',
            'sort' => 'integer',
        ];
    }
}
