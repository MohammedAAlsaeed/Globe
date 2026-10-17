<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * A subscription plan and its limits. `null` limits are unlimited.
 *
 * @property string $code
 * @property int $tier
 * @property int|null $max_maps
 * @property int $max_export_px
 * @property int $upload_quota_bytes
 * @property int|null $max_line_styles
 * @property bool $commercial_use
 */
#[Fillable(['code', 'name', 'tier', 'max_maps', 'max_export_px', 'upload_quota_bytes', 'max_line_styles', 'commercial_use', 'is_default', 'sort'])]
class Plan extends Model
{
    protected function casts(): array
    {
        return [
            'tier' => 'integer',
            'max_maps' => 'integer',
            'max_export_px' => 'integer',
            'upload_quota_bytes' => 'integer',
            'max_line_styles' => 'integer',
            'commercial_use' => 'boolean',
            'is_default' => 'boolean',
        ];
    }

    /** The plan every account has without a subscription. */
    public static function default(): self
    {
        return static::query()->where('is_default', true)->firstOrFail();
    }
}
