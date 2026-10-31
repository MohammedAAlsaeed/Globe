<?php

namespace App\Support;

/**
 * What a person's saved editor preferences may hold — the same settings
 * the editor accepts (app/features/mapmaker/controls.ts → sanitizeControls,
 * shortcuts.ts → resolveBindings). Unknown settings are dropped rather than
 * refused, so an older or newer editor never locks anyone out; a setting
 * with a wrong value is refused.
 */
class PreferenceRules
{
    /** The whole stored document, at most this many bytes of JSON. */
    public const MAX_BYTES = 16_000;

    private const CHOICES = [
        'wheel' => ['auto', 'mouse', 'trackpad'],
        'ctrlWheel' => ['zoom', 'rotate'],
        'middleButton' => ['pan', 'none'],
    ];

    private const BOOLS = ['invertZoom', 'zoomToCursor', 'smoothZoom', 'spacePan'];

    private const NUMBERS = [
        'zoomSpeed' => [0.25, 3],
        'panStep' => [10, 600],
        'rotateStep' => [1, 90],
    ];

    private const TOUCH = [
        'bools' => ['fingerDraws', 'pinchZoom', 'longPress'],
        'numbers' => ['longPressMs' => [300, 1500]],
        'choices' => [],
    ];

    private const PEN = [
        'bools' => ['pressure', 'palmRejection'],
        'numbers' => [],
        'choices' => ['curve' => ['soft', 'linear', 'firm'], 'sideButton' => ['pan', 'menu', 'none']],
    ];

    /** Mouse, trackpad, touch and pen settings: the clean settings, or an error. */
    public static function controls(mixed $value): array|string
    {
        if (! is_array($value) || ($value !== [] && array_is_list($value))) {
            return 'The controls must be an object.';
        }
        $out = self::group($value, self::BOOLS, self::NUMBERS, self::CHOICES);
        if (is_string($out)) {
            return $out;
        }
        foreach (['touch' => self::TOUCH, 'pen' => self::PEN] as $key => $rules) {
            if (! array_key_exists($key, $value)) {
                continue;
            }
            $part = $value[$key];
            if (! is_array($part) || ($part !== [] && array_is_list($part))) {
                return "The {$key} settings must be an object.";
            }
            $clean = self::group($part, $rules['bools'], $rules['numbers'], $rules['choices']);
            if (is_string($clean)) {
                return $clean;
            }
            $out[$key] = $clean;
        }

        return $out;
    }

    /** @param array<string, array{0: float|int, 1: float|int}> $numbers */
    private static function group(array $value, array $bools, array $numbers, array $choices): array|string
    {
        $out = [];
        foreach ($bools as $k) {
            if (array_key_exists($k, $value)) {
                if (! is_bool($value[$k])) {
                    return "{$k} must be true or false.";
                }
                $out[$k] = $value[$k];
            }
        }
        foreach ($numbers as $k => [$min, $max]) {
            if (array_key_exists($k, $value)) {
                $v = $value[$k];
                if (! (is_int($v) || is_float($v)) || ! is_finite((float) $v) || $v < $min || $v > $max) {
                    return "{$k} is out of range.";
                }
                $out[$k] = $v;
            }
        }
        foreach ($choices as $k => $list) {
            if (array_key_exists($k, $value)) {
                if (! in_array($value[$k], $list, true)) {
                    return "{$k} has an unknown value.";
                }
                $out[$k] = $value[$k];
            }
        }

        return $out;
    }

    /** Custom shortcuts ({ "tool.line": ["KeyI"] }): the clean map, or an error. */
    public static function shortcuts(mixed $value): array|string
    {
        if (! is_array($value) || ($value !== [] && array_is_list($value))) {
            return 'The shortcuts must be an object.';
        }
        if (count($value) > 100) {
            return 'Too many shortcuts.';
        }
        $out = [];
        foreach ($value as $id => $keys) {
            if (! is_string($id) || ! preg_match('/^[a-z]{2,12}\.[A-Za-z]{2,24}$/', $id)) {
                return 'Unknown shortcut.';
            }
            if (! is_array($keys) || ! array_is_list($keys) || count($keys) > 6) {
                return "The keys of {$id} must be a short list.";
            }
            foreach ($keys as $k) {
                if (! is_string($k) || ! preg_match('/^((Mod|Shift|Alt)\+){0,3}[A-Za-z0-9]{1,20}$/', $k)) {
                    return "A key of {$id} is invalid.";
                }
            }
            $out[$id] = $keys;
        }

        return $out;
    }
}
