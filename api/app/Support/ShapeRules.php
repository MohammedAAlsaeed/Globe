<?php

namespace App\Support;

/**
 * The rules for Shape Tool data — a shape's look (also what a saved style
 * holds) and a shape object in a map document. They mirror the editor's own
 * checks (app/features/mapmaker/shapes/validate.ts); keep the two in step.
 *
 * Geometry is bounded as well as the values: how many paths a shape holds,
 * how deeply its groups nest, how many nodes and doors it has — so a style
 * or map from the API can never ask the editor for unbounded work.
 */
final class ShapeRules
{
    /** Paths in one shape (all groups). */
    public const MAX_PATHS = 64;

    /** Groups inside groups. */
    public const MAX_DEPTH = 4;

    /** Nodes in one shape (all paths). */
    public const MAX_TOTAL_NODES = 8000;

    /** Doors in one shape. */
    public const MAX_PORTALS = 64;

    /** Shape objects per map document (all layers). */
    public const MAX_SHAPES = 20000;

    private const OPS = ['add', 'subtract', 'intersect', 'exclude'];

    private const PRIMS = ['rect', 'ellipse', 'polygon', 'star'];

    private const FILLS = ['none', 'color', 'texture', 'pattern', 'mask'];

    private const PATTERNS = ['forest', 'mountains', 'desert', 'water', 'grass', 'swamp'];

    private const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'soft-light', 'hard-light', 'hue', 'saturation', 'color', 'luminosity'];

    /** The brush texture catalog (app/features/mapmaker/brush/textures.ts). */
    private const TEXTURES = [
        'grass', 'meadow', 'savanna', 'forest', 'pine', 'jungle', 'swamp', 'farmland',
        'sand', 'dunes', 'desert', 'dirt', 'mud', 'rock', 'mountains', 'cliffs', 'snow', 'ice', 'tundra', 'ash',
        'shallows', 'ocean', 'deep', 'lava', 'parchment', 'cobblestone', 'planks', 'flagstone', 'inkwash',
    ];

    /** Why a look is invalid, or null when it's fine. */
    public static function lookError(mixed $look): ?string
    {
        if (! self::isMap($look)) {
            return 'The look must be an object.';
        }
        if (($e = self::strokeError($look['stroke'] ?? null)) !== null) {
            return $e;
        }
        if (($e = self::fillError($look['fill'] ?? null)) !== null) {
            return $e;
        }
        if (! self::num($look['opacity'] ?? null, 0, 1)) {
            return 'The opacity must be between 0 and 1.';
        }
        if (array_key_exists('blend', $look) && ! in_array($look['blend'], self::BLENDS, true)) {
            return 'Unknown blend mode.';
        }

        return null;
    }

    private static function strokeError(mixed $s): ?string
    {
        if (! self::isMap($s)) {
            return 'The stroke must be an object.';
        }
        if (! in_array($s['mode'] ?? null, ['none', 'color', 'stamp'], true)) {
            return 'The stroke mode must be none, color or stamp.';
        }
        if (! in_array($s['align'] ?? null, ['center', 'inside', 'outside'], true)) {
            return 'The stroke must be inside, centred or outside.';
        }
        if (! self::num($s['opacity'] ?? null, 0, 1)) {
            return 'The stroke opacity must be between 0 and 1.';
        }

        return LineRules::strokeError($s['color'] ?? null) ?? LineRules::stampError($s['stamp'] ?? null);
    }

    private static function fillError(mixed $f): ?string
    {
        if (! self::isMap($f)) {
            return 'The fill must be an object.';
        }
        $src = $f['source'] ?? null;
        $sourceOk = self::isMap($src)
            && in_array($src['type'] ?? null, ['color', 'texture'], true)
            && self::hex($src['color'] ?? null)
            && in_array($src['texture'] ?? null, self::TEXTURES, true)
            && self::num($src['textureScale'] ?? null, 0.05, 20)
            && self::num($src['textureRotation'] ?? null, -3600, 3600)
            && self::num($src['hue'] ?? null, -360, 360)
            && self::num($src['saturation'] ?? null, -1, 1)
            && self::num($src['brightness'] ?? null, -1, 1)
            && self::num($src['contrast'] ?? null, -1, 1);
        $ok = in_array($f['type'] ?? null, self::FILLS, true)
            && $sourceOk
            && in_array($f['pattern'] ?? null, self::PATTERNS, true)
            && self::num($f['opacity'] ?? null, 0, 1)
            && in_array($f['anchor'] ?? null, ['map', 'shape'], true)
            && is_bool($f['invert'] ?? null)
            && self::num($f['feather'] ?? null, 0, 0.2);

        return $ok ? null : 'The fill has invalid values.';
    }

    /** Why a shape object (from a map document) is invalid, or null. */
    public static function shapeError(mixed $shape): ?string
    {
        if (! self::isMap($shape)) {
            return 'A shape must be an object.';
        }
        if (! is_string($shape['id'] ?? null) || strlen($shape['id']) > 64) {
            return 'A shape needs an id.';
        }
        $tally = ['paths' => 0, 'nodes' => 0, 'ids' => []];
        if (($e = self::partsError($shape['parts'] ?? null, 0, $tally)) !== null) {
            return $e;
        }
        $portals = $shape['portals'] ?? null;
        if (! is_array($portals) || ! array_is_list($portals) || count($portals) > self::MAX_PORTALS) {
            return 'A shape has up to '.self::MAX_PORTALS.' doors.';
        }
        foreach ($portals as $p) {
            $ok = self::isMap($p)
                && self::id($p['id'] ?? null)
                && is_string($p['part'] ?? null) && ($tally['ids'][$p['part']] ?? null) === 'path'
                && is_int($p['seg'] ?? null) && $p['seg'] >= 0 && $p['seg'] <= 2000
                && self::num($p['t'] ?? null, 0, 1)
                && self::num($p['width'] ?? null, 0.0005, 0.5);
            if (! $ok) {
                return 'A door is invalid.';
            }
        }
        $frame = $shape['frame'] ?? null;
        if (! (self::isMap($frame)
            && self::num($frame['x'] ?? null, -4, 5) && self::num($frame['y'] ?? null, -4, 5)
            && self::num($frame['rot'] ?? null, -3600, 3600) && self::num($frame['scale'] ?? null, 0.01, 100))) {
            return 'The shape frame is invalid.';
        }
        // An empty name arrives as null (requests turn "" into null).
        if (array_key_exists('name', $shape) && ! ($shape['name'] === null || (is_string($shape['name']) && mb_strlen($shape['name']) <= 80))) {
            return 'A shape name is at most 80 characters.';
        }
        if (array_key_exists('styleId', $shape) && ! ($shape['styleId'] === null || (is_string($shape['styleId']) && strlen($shape['styleId']) <= 64))) {
            return 'Invalid shape style.';
        }

        return self::lookError($shape);
    }

    /** @param array{paths: int, nodes: int, ids: array<string, string>} $tally */
    private static function partsError(mixed $parts, int $level, array &$tally): ?string
    {
        if (! is_array($parts) || ! array_is_list($parts) || count($parts) === 0) {
            return 'A shape needs at least one part.';
        }
        if ($level > self::MAX_DEPTH) {
            return 'Shape groups nest too deeply.';
        }
        foreach ($parts as $part) {
            if (! self::isMap($part) || ! self::id($part['id'] ?? null) || ! in_array($part['op'] ?? null, self::OPS, true)) {
                return 'A shape part is invalid.';
            }
            if (isset($tally['ids'][$part['id']])) {
                return 'Two shape parts share an id.';
            }
            if (array_key_exists('parts', $part)) {
                $tally['ids'][$part['id']] = 'group';
                if (array_key_exists('nodes', $part) || array_key_exists('prim', $part)) {
                    return 'A shape group has no nodes of its own.';
                }
                if (($e = self::partsError($part['parts'], $level + 1, $tally)) !== null) {
                    return $e;
                }

                continue;
            }
            $tally['ids'][$part['id']] = 'path';
            if (($e = self::nodesError($part['nodes'] ?? null)) !== null) {
                return $e;
            }
            if (array_key_exists('prim', $part) && ! self::primOk($part['prim'])) {
                return 'A shape primitive is invalid.';
            }
            $tally['paths']++;
            $tally['nodes'] += count($part['nodes']);
            if ($tally['paths'] > self::MAX_PATHS) {
                return 'A shape holds up to '.self::MAX_PATHS.' paths.';
            }
            if ($tally['nodes'] > self::MAX_TOTAL_NODES) {
                return 'A shape has too many nodes.';
            }
        }

        return null;
    }

    private static function nodesError(mixed $nodes): ?string
    {
        if (! is_array($nodes) || ! array_is_list($nodes) || count($nodes) < 3 || count($nodes) > LineRules::MAX_NODES) {
            return 'A shape path needs between 3 and '.LineRules::MAX_NODES.' nodes.';
        }
        foreach ($nodes as $node) {
            if (! self::isMap($node) || ! self::num($node['x'] ?? null, -1, 2) || ! self::num($node['y'] ?? null, -1, 2)) {
                return 'A shape node is out of range.';
            }
            if (array_key_exists('t', $node) && ! in_array($node['t'], ['corner', 'smooth'], true)) {
                return 'Unknown node type.';
            }
            foreach (['hi', 'ho'] as $handle) {
                if (array_key_exists($handle, $node)
                    && ! (self::isMap($node[$handle]) && self::num($node[$handle]['x'] ?? null, -4, 4) && self::num($node[$handle]['y'] ?? null, -4, 4))) {
                    return 'A shape handle is out of range.';
                }
            }
        }

        return null;
    }

    private static function primOk(mixed $p): bool
    {
        return self::isMap($p)
            && in_array($p['kind'] ?? null, self::PRIMS, true)
            && self::num($p['cx'] ?? null, -1, 2) && self::num($p['cy'] ?? null, -1, 2)
            && self::num($p['w'] ?? null, 0, 4) && self::num($p['h'] ?? null, 0, 4)
            && self::num($p['rot'] ?? null, -3600, 3600)
            && (! array_key_exists('radius', $p) || self::num($p['radius'], 0, 0.5))
            && (! array_key_exists('sides', $p) || (is_int($p['sides']) && $p['sides'] >= 3 && $p['sides'] <= 64))
            && (! array_key_exists('inner', $p) || self::num($p['inner'], 0.05, 0.95));
    }

    /**
     * Checks every shape in a map document; returns the first problem, or
     * null. Other kinds of objects are the editor's to check.
     */
    public static function documentError(mixed $document): ?string
    {
        $layers = self::isMap($document) ? ($document['layers'] ?? []) : [];
        if (! is_array($layers)) {
            return null;
        }
        $count = 0;
        foreach ($layers as $i => $layer) {
            $objects = self::isMap($layer) ? ($layer['objects'] ?? []) : [];
            if (! is_array($objects)) {
                continue;
            }
            foreach ($objects as $object) {
                if (! self::isMap($object) || ($object['kind'] ?? null) !== 'shape') {
                    continue;
                }
                if (++$count > self::MAX_SHAPES) {
                    return 'The map has too many shapes.';
                }
                if (($e = self::shapeError($object)) !== null) {
                    return "Layer {$i}: {$e}";
                }
            }
        }

        return null;
    }

    private static function id(mixed $v): bool
    {
        return is_string($v) && $v !== '' && strlen($v) <= 64;
    }

    private static function isMap(mixed $v): bool
    {
        return is_array($v) && ($v === [] || ! array_is_list($v));
    }

    private static function num(mixed $v, float $min, float $max): bool
    {
        return (is_int($v) || is_float($v)) && is_finite((float) $v) && $v >= $min && $v <= $max;
    }

    private static function hex(mixed $v): bool
    {
        return is_string($v) && preg_match('/^#[0-9a-f]{6}$/i', $v) === 1;
    }
}
