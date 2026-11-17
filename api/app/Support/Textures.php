<?php

namespace App\Support;

/**
 * What a texture reference in a map may be: one of the textures built into
 * the editor (app/features/mapmaker/brush/textures.ts), or an uploaded
 * texture, "u:<asset id>" (the asset library, kind "textures").
 */
final class Textures
{
    /** The built-in texture catalog. */
    public const BUILTIN = [
        'grass', 'meadow', 'savanna', 'forest', 'pine', 'jungle', 'swamp', 'farmland',
        'sand', 'dunes', 'desert', 'dirt', 'mud', 'rock', 'mountains', 'cliffs', 'snow', 'ice', 'tundra', 'ash',
        'shallows', 'ocean', 'deep', 'lava', 'parchment', 'cobblestone', 'planks', 'flagstone', 'inkwash',
        // The Navigators (app/features/mapmaker/brush/navigatorTextures.ts)
        'navSeaGrid', 'navSeaTeal', 'navWaveMarks', 'navSeaChart', 'navParchment', 'navRhumbParchment',
        'navCreamPaper', 'navRicePaper', 'navIslandGrass', 'navHills', 'navOchreLand', 'navShore',
    ];

    /** How uploaded textures are filed (the catalog's categories). */
    public const CATEGORIES = ['terrain', 'vegetation', 'water', 'mountains', 'desert', 'paper', 'details', 'special', 'navigators'];

    public static function isId(mixed $id): bool
    {
        return is_string($id)
            && (in_array($id, self::BUILTIN, true) || preg_match('/^u:[0-9A-Za-z]{26}$/', $id) === 1);
    }

    /**
     * Why a paint source (colour or texture, as the editor saves it) is
     * invalid, or null when it is fine. Texture offsets are optional: maps
     * saved before they existed have none.
     */
    public static function sourceError(mixed $src): ?string
    {
        $ok = is_array($src)
            && in_array($src['type'] ?? null, ['color', 'texture'], true)
            && is_string($src['color'] ?? null) && preg_match('/^#[0-9a-fA-F]{6}$/', $src['color']) === 1
            && self::isId($src['texture'] ?? null)
            && self::num($src['textureScale'] ?? null, 0.05, 20)
            && self::num($src['textureRotation'] ?? null, -3600, 3600)
            && self::optional($src, 'textureOffsetX', -1, 1)
            && self::optional($src, 'textureOffsetY', -1, 1)
            && self::num($src['hue'] ?? null, -360, 360)
            && self::num($src['saturation'] ?? null, -1, 1)
            && self::num($src['brightness'] ?? null, -1, 1)
            && self::num($src['contrast'] ?? null, -1, 1);

        return $ok ? null : 'The colour or texture is not valid.';
    }

    private static function optional(array $src, string $key, float $min, float $max): bool
    {
        return ! array_key_exists($key, $src) || self::num($src[$key], $min, $max);
    }

    private static function num(mixed $v, float $min, float $max): bool
    {
        return (is_int($v) || is_float($v)) && is_finite((float) $v) && $v >= $min && $v <= $max;
    }
}
