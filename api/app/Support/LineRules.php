<?php

namespace App\Support;

/**
 * The rules for Line Tool data — a line's look (also what a saved style
 * holds) and a line object in a map document. They mirror the editor's own
 * checks (app/features/mapmaker/lines/validate.ts); keep the two in step.
 *
 * Every number is range-checked and every option is checked against its
 * list, so a style or map from the API can never carry values the editor
 * would refuse (or that would make it draw millions of pieces).
 */
final class LineRules
{
    /** Nodes per line. */
    public const MAX_NODES = 2000;

    /** Line width / piece thickness, fraction of the map width. */
    public const MAX_WIDTH = 0.2;

    /** Line objects per map document (all layers). */
    public const MAX_LINES = 20000;

    private const PATTERNS = ['solid', 'dashed', 'dotted', 'dashdot', 'custom'];

    private const CAPS = ['round', 'butt', 'square'];

    private const JOINS = ['round', 'miter', 'bevel'];

    private const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'soft-light', 'hard-light', 'hue', 'saturation', 'color', 'luminosity'];

    /** Stamp-catalog asset keys: built-in vector art or an uploaded image. */
    private const ASSET_KEY = '/^(b:[\w-]{1,40}:\d{1,3}|u:[0-9A-Za-z]{10,40})$/';

    /** Why a look is invalid, or null when it's fine. */
    public static function lookError(mixed $look): ?string
    {
        if (! self::isMap($look)) {
            return 'The look must be an object.';
        }
        if (! in_array($look['mode'] ?? null, ['color', 'stamp'], true)) {
            return 'The stroke mode must be color or stamp.';
        }
        if (($e = self::strokeError($look['stroke'] ?? null)) !== null) {
            return $e;
        }
        if (($e = self::stampError($look['stamp'] ?? null)) !== null) {
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

    /** Why a line object (from a map document) is invalid, or null. */
    public static function lineError(mixed $line): ?string
    {
        if (! self::isMap($line)) {
            return 'A line must be an object.';
        }
        if (! is_string($line['id'] ?? null) || strlen($line['id']) > 64) {
            return 'A line needs an id.';
        }
        if (! is_bool($line['closed'] ?? null)) {
            return 'A line must say whether it is closed.';
        }
        $nodes = $line['nodes'] ?? null;
        $min = $line['closed'] ? 3 : 2;
        if (! is_array($nodes) || ! array_is_list($nodes) || count($nodes) < $min || count($nodes) > self::MAX_NODES) {
            return "A line needs between {$min} and ".self::MAX_NODES.' nodes.';
        }
        foreach ($nodes as $node) {
            if (! self::isMap($node) || ! self::num($node['x'] ?? null, -1, 2) || ! self::num($node['y'] ?? null, -1, 2)) {
                return 'A line node is out of range.';
            }
            if (array_key_exists('t', $node) && ! in_array($node['t'], ['corner', 'smooth'], true)) {
                return 'Unknown node type.';
            }
            foreach (['hi', 'ho'] as $handle) {
                if (array_key_exists($handle, $node)
                    && ! (self::isMap($node[$handle]) && self::num($node[$handle]['x'] ?? null, -4, 4) && self::num($node[$handle]['y'] ?? null, -4, 4))) {
                    return 'A line handle is out of range.';
                }
            }
        }
        if (array_key_exists('name', $line) && ! (is_string($line['name']) && mb_strlen($line['name']) <= 80)) {
            return 'A line name is at most 80 characters.';
        }
        if (array_key_exists('styleId', $line) && ! ($line['styleId'] === null || (is_string($line['styleId']) && strlen($line['styleId']) <= 64))) {
            return 'Invalid line style.';
        }

        return self::lookError($line);
    }

    /**
     * Checks every line in a map document; returns the first problem, or
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
                if (! self::isMap($object) || ($object['kind'] ?? null) !== 'line') {
                    continue;
                }
                if (++$count > self::MAX_LINES) {
                    return 'The map has too many lines.';
                }
                if (($e = self::lineError($object)) !== null) {
                    return "Layer {$i}: {$e}";
                }
            }
        }

        return null;
    }

    private static function strokeError(mixed $s): ?string
    {
        if (! self::isMap($s)) {
            return 'The color stroke must be an object.';
        }
        $ok = self::hex($s['color'] ?? null)
            && self::num($s['width'] ?? null, 0.0002, self::MAX_WIDTH)
            && in_array($s['pattern'] ?? null, self::PATTERNS, true)
            && self::num($s['dash'] ?? null, 0.1, 50)
            && self::num($s['gap'] ?? null, 0.1, 50)
            && in_array($s['cap'] ?? null, self::CAPS, true)
            && in_array($s['join'] ?? null, self::JOINS, true)
            && self::num($s['blur'] ?? null, 0, 1)
            && self::num($s['casing'] ?? null, 0, 0.05)
            && self::hex($s['casingColor'] ?? null);

        return $ok ? null : 'The color stroke has invalid values.';
    }

    private static function stampError(mixed $s): ?string
    {
        if (! self::isMap($s) || ! self::isMap($s['parts'] ?? null)) {
            return 'The stamp stroke must be an object with parts.';
        }
        $parts = $s['parts'];
        $seg = $parts['seg'] ?? null;
        if (! is_array($seg) || ! array_is_list($seg) || count($seg) < 1 || count($seg) > 32) {
            return 'The stamp stroke needs 1 to 32 pieces.';
        }
        foreach ([...$seg, ...array_filter([$parts['start'] ?? null, $parts['end'] ?? null, $parts['corner'] ?? null], fn ($v) => $v !== null)] as $key) {
            if (! is_string($key) || ! preg_match(self::ASSET_KEY, $key)) {
                return 'Unknown line art.';
            }
        }
        $ok = is_string($s['set'] ?? null) && strlen($s['set']) <= 120
            && self::hex($s['ink'] ?? null)
            && array_key_exists('fill', $s) && ($s['fill'] === null || self::hex($s['fill']))
            && self::num($s['size'] ?? null, 0.0005, self::MAX_WIDTH)
            && self::num($s['spacing'] ?? null, -0.9, 10)
            && self::num($s['rotation'] ?? null, -360, 360)
            && is_bool($s['followPath'] ?? null)
            && self::num($s['offset'] ?? null, -10, 10)
            && is_bool($s['flip'] ?? null)
            && is_bool($s['fit'] ?? null)
            && in_array($s['corners'] ?? null, ['continuous', 'split'], true)
            && is_bool($s['caps'] ?? null)
            && self::num($s['scaleJitter'] ?? null, 0, 1)
            && self::num($s['rotationJitter'] ?? null, 0, 1)
            && in_array($s['anchor'] ?? null, ['center', 'base'], true)
            && self::num($s['seed'] ?? null, 0, 2 ** 32);

        return $ok ? null : 'The stamp stroke has invalid values.';
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
