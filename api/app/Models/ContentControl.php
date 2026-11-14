<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

/**
 * A staff decision about one piece of art that ships inside the web app
 * (see the `content_controls` migration). Today the only decision is
 * "hidden": the editor leaves the item out of its catalogs.
 */
#[Fillable(['kind', 'key', 'hidden', 'updated_by'])]
class ContentControl extends Model
{
    /** What can be hidden; the keys are ids from the web app's code. */
    public const KINDS = ['stamp_set', 'line_art', 'line_style', 'text_style', 'shape_style', 'texture', 'template'];

    private const CACHE_KEY = 'content-controls:hidden';

    protected function casts(): array
    {
        return ['hidden' => 'boolean'];
    }

    /**
     * Hidden keys by kind, every kind present. Asked for by every editor
     * that opens, so it is cached; `forget()` after each change.
     *
     * @return array<string, list<string>>
     */
    public static function hidden(): array
    {
        return Cache::remember(self::CACHE_KEY, 300, function () {
            $out = array_fill_keys(self::KINDS, []);
            foreach (static::query()->where('hidden', true)->orderBy('key')->get(['kind', 'key']) as $row) {
                if (isset($out[$row->kind])) {
                    $out[$row->kind][] = $row->key;
                }
            }

            return $out;
        });
    }

    public static function forget(): void
    {
        Cache::forget(self::CACHE_KEY);
    }
}
