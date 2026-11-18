<?php

namespace App\Support;

/**
 * Stamps in the editor's Stamp Catalog: how uploaded stamps are filed, how
 * they are placed by default (`meta`), and what a favourite stamp may hold.
 * The editor's side is app/features/mapmaker/stamps/catalog.ts.
 */
final class Stamps
{
    /** Catalog categories (built-in sets use the same). */
    public const CATEGORIES = ['terrain', 'vegetation', 'settlements', 'water', 'creatures', 'symbols', 'decorations'];

    /** Where a stamp stands: on its base (side views) or about its centre (top-down art). */
    public const PIVOTS = ['base', 'center'];

    /** How an uploaded stamp is placed by default. */
    public static function metaRules(): array
    {
        return [
            'meta' => ['sometimes', 'nullable', 'array:pivot,size,shadow'],
            'meta.pivot' => ['sometimes', 'string', 'in:'.implode(',', self::PIVOTS)],
            // Width as a fraction of the map width.
            'meta.size' => ['sometimes', 'numeric', 'between:0.003,0.5'],
            // A soft ground shadow by default.
            'meta.shadow' => ['sometimes', 'boolean'],
        ];
    }

    /** The meta with proper types (forms send strings). */
    public static function meta(array $meta): array
    {
        $out = [];
        if (isset($meta['pivot'])) {
            $out['pivot'] = (string) $meta['pivot'];
        }
        if (array_key_exists('size', $meta)) {
            $out['size'] = round((float) $meta['size'], 4);
        }
        if (array_key_exists('shadow', $meta)) {
            $out['shadow'] = filter_var($meta['shadow'], FILTER_VALIDATE_BOOLEAN);
        }

        return $out;
    }

    /**
     * The look a favourite stamp keeps (the Stamp Tool's own fields), and
     * what each may be. Unknown fields are dropped.
     */
    public static function lookRules(string $prefix): array
    {
        $hex = 'regex:/^#[0-9a-fA-F]{6}$/';

        return [
            "{$prefix}.size" => ['required', 'numeric', 'between:0.0005,1'],
            "{$prefix}.rotation" => ['sometimes', 'numeric', 'between:-3600,3600'],
            "{$prefix}.flipX" => ['sometimes', 'boolean'],
            "{$prefix}.flipY" => ['sometimes', 'boolean'],
            "{$prefix}.ink" => ['sometimes', 'string', $hex],
            "{$prefix}.fill" => ['sometimes', 'nullable', 'string', $hex],
            "{$prefix}.opacity" => ['sometimes', 'numeric', 'between:0,1'],
            "{$prefix}.hue" => ['sometimes', 'numeric', 'between:-180,180'],
            "{$prefix}.saturation" => ['sometimes', 'numeric', 'between:-1,1'],
            "{$prefix}.brightness" => ['sometimes', 'numeric', 'between:-1,1'],
            "{$prefix}.contrast" => ['sometimes', 'numeric', 'between:-1,1'],
            "{$prefix}.shadow" => ['sometimes', 'string', 'in:none,default,layer,custom'],
            "{$prefix}.stretch" => ['sometimes', 'numeric', 'between:0.2,5'],
            "{$prefix}.pivot" => ['sometimes', 'string', 'in:'.implode(',', self::PIVOTS)],
        ];
    }

    public const LOOK_FIELDS = [
        'size', 'rotation', 'flipX', 'flipY', 'ink', 'fill', 'opacity',
        'hue', 'saturation', 'brightness', 'contrast', 'shadow', 'stretch', 'pivot',
    ];
}
