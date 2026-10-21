<?php

namespace App\Support;

/**
 * The rules for Text Tool data — a text's look (also what a saved style
 * holds) and a text object in a map document. They mirror the editor's own
 * checks (app/features/mapmaker/text/validate.ts); keep the two in step.
 *
 * Every number is range-checked and every option checked against its list,
 * so a style or a map from the API can never carry values the editor would
 * refuse — or ask it to shape megabytes of text.
 */
final class TextRules
{
    /** Characters per text. */
    public const MAX_CHARS = 2000;

    /** Nodes of a text's path. */
    public const MAX_NODES = 2000;

    /** Text objects per map document (all layers). */
    public const MAX_TEXTS = 20000;

    private const ALIGNS = ['start', 'center', 'end', 'left', 'right'];

    private const DIRECTIONS = ['auto', 'ltr', 'rtl'];

    private const JOINS = ['round', 'miter', 'bevel'];

    private const CURVES = ['straight', 'arc', 'path'];

    private const LETTERS = ['auto', 'warp', 'letters', 'words'];

    private const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'soft-light', 'hard-light', 'hue', 'saturation', 'color', 'luminosity'];

    /** Font and profile ids ("amiri", "royal-kingdom"). */
    private const ID = '/^[a-z0-9][a-z0-9-]{0,59}$/';

    /** Why a look is invalid, or null when it's fine. */
    public static function lookError(mixed $look): ?string
    {
        if (! self::isMap($look)) {
            return 'The look must be an object.';
        }
        if (! is_string($look['profile'] ?? null) || ! preg_match(self::ID, $look['profile'])) {
            return 'Unknown font profile.';
        }
        if (! array_key_exists('font', $look) || ($look['font'] !== null && (! is_string($look['font']) || ! preg_match(self::ID, $look['font'])))) {
            return 'Unknown font.';
        }
        $ok = self::num($look['size'] ?? null, 0.001, 0.5)
            && self::num($look['weight'] ?? null, 100, 900)
            && is_bool($look['italic'] ?? null)
            && is_bool($look['caps'] ?? null)
            && self::num($look['letterSpacing'] ?? null, -0.2, 2)
            && self::num($look['wordSpacing'] ?? null, -0.5, 3)
            && self::num($look['lineHeight'] ?? null, 0.5, 4)
            && in_array($look['align'] ?? null, self::ALIGNS, true)
            && in_array($look['direction'] ?? null, self::DIRECTIONS, true)
            && self::num($look['kashida'] ?? null, 0, 1)
            && self::hex($look['fill'] ?? null)
            && self::num($look['fillOpacity'] ?? null, 0, 1)
            && self::num($look['opacity'] ?? null, 0, 1)
            && in_array($look['curveMode'] ?? null, self::CURVES, true)
            && self::num($look['curve'] ?? null, -100, 100)
            && in_array($look['letters'] ?? null, self::LETTERS, true);
        if (! $ok) {
            return 'The text look has invalid values.';
        }
        // "" arrives as null (ConvertEmptyStringsToNull): no language, read from the letters.
        $lang = $look['lang'] ?? '';
        if (! is_string($lang) || ($lang !== '' && ! preg_match('/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8}){0,3}$/', $lang))) {
            return 'Unknown language.';
        }
        $features = $look['features'] ?? null;
        if (! is_array($features) || ($features !== [] && array_is_list($features)) || count($features) > 24) {
            return 'Invalid OpenType features.';
        }
        foreach ($features as $tag => $on) {
            if (! is_string($tag) || ! preg_match('/^[a-z0-9]{4}$/', $tag) || ! is_bool($on)) {
                return 'Invalid OpenType features.';
            }
        }
        if (array_key_exists('blend', $look) && ! in_array($look['blend'], self::BLENDS, true)) {
            return 'Unknown blend mode.';
        }
        $o = $look['outline'] ?? null;
        if (! self::isMap($o) || ! is_bool($o['enabled'] ?? null) || ! self::hex($o['color'] ?? null) || ! self::num($o['width'] ?? null, 0, 1)
            || ! self::num($o['opacity'] ?? null, 0, 1) || ! in_array($o['join'] ?? null, self::JOINS, true) || ! in_array($o['position'] ?? null, ['outside', 'center'], true)) {
            return 'The outline has invalid values.';
        }
        $s = $look['shadow'] ?? null;
        if (! self::isMap($s) || ! is_bool($s['enabled'] ?? null) || ! self::hex($s['color'] ?? null) || ! self::num($s['opacity'] ?? null, 0, 1)
            || ! self::num($s['blur'] ?? null, 0, 2) || ! self::num($s['offsetX'] ?? null, -2, 2) || ! self::num($s['offsetY'] ?? null, -2, 2)) {
            return 'The shadow has invalid values.';
        }

        return null;
    }

    /** Why a text object (from a map document) is invalid, or null. */
    public static function textError(mixed $text): ?string
    {
        if (! self::isMap($text)) {
            return 'A text must be an object.';
        }
        if (! is_string($text['id'] ?? null) || strlen($text['id']) > 64) {
            return 'A text needs an id.';
        }
        $words = $text['text'] ?? null;
        if (! is_string($words) || $words === '' || mb_strlen($words) > self::MAX_CHARS) {
            return 'A text needs between 1 and '.self::MAX_CHARS.' characters.';
        }
        if (! self::num($text['x'] ?? null, -1, 2) || ! self::num($text['y'] ?? null, -1, 2) || ! self::num($text['rotation'] ?? null, -3600, 3600)) {
            return 'A text is out of the map.';
        }
        if (! array_key_exists('boxWidth', $text) || ($text['boxWidth'] !== null && ! self::num($text['boxWidth'], 0.002, 2))) {
            return 'Invalid text width.';
        }
        if (array_key_exists('name', $text) && ! (is_string($text['name']) && mb_strlen($text['name']) <= 80)) {
            return 'A text name is at most 80 characters.';
        }
        if (array_key_exists('styleId', $text) && ! ($text['styleId'] === null || (is_string($text['styleId']) && strlen($text['styleId']) <= 64))) {
            return 'Invalid text style.';
        }
        if (array_key_exists('attach', $text) && $text['attach'] !== null) {
            $a = $text['attach'];
            if (! self::isMap($a) || ! is_string($a['to'] ?? null) || strlen($a['to']) > 64 || ! self::num($a['dx'] ?? null, -2, 2) || ! self::num($a['dy'] ?? null, -2, 2)) {
                return 'Invalid stamp link.';
            }
        }
        if (array_key_exists('path', $text) && ($e = self::pathError($text['path'])) !== null) {
            return $e;
        }

        return self::lookError($text);
    }

    private static function pathError(mixed $p): ?string
    {
        if (! self::isMap($p)) {
            return 'A text path must be an object.';
        }
        $nodes = $p['nodes'] ?? null;
        if (! is_array($nodes) || ! array_is_list($nodes) || count($nodes) < 2 || count($nodes) > self::MAX_NODES) {
            return 'A text path needs between 2 and '.self::MAX_NODES.' nodes.';
        }
        foreach ($nodes as $node) {
            if (! self::isMap($node) || ! self::num($node['x'] ?? null, -1, 2) || ! self::num($node['y'] ?? null, -1, 2)) {
                return 'A text path node is out of range.';
            }
            if (array_key_exists('t', $node) && ! in_array($node['t'], ['corner', 'smooth'], true)) {
                return 'Unknown node type.';
            }
            foreach (['hi', 'ho'] as $h) {
                if (array_key_exists($h, $node) && ! (self::isMap($node[$h]) && self::num($node[$h]['x'] ?? null, -4, 4) && self::num($node[$h]['y'] ?? null, -4, 4))) {
                    return 'A text path handle is out of range.';
                }
            }
        }
        $ok = is_bool($p['reverse'] ?? null)
            && in_array($p['align'] ?? null, ['start', 'center', 'end'], true)
            && self::num($p['offset'] ?? null, -1, 1)
            && in_array($p['side'] ?? null, ['above', 'center', 'below'], true)
            && self::num($p['baseline'] ?? null, -5, 5)
            && is_bool($p['smooth'] ?? null);

        return $ok ? null : 'The text path has invalid values.';
    }

    /** Checks every text in a map document; returns the first problem, or null. */
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
                if (! self::isMap($object) || ($object['kind'] ?? null) !== 'text') {
                    continue;
                }
                if (++$count > self::MAX_TEXTS) {
                    return 'The map has too many texts.';
                }
                if (($e = self::textError($object)) !== null) {
                    return "Layer {$i}: {$e}";
                }
            }
        }

        return null;
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
