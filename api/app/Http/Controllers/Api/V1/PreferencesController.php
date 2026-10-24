<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\PreferenceRules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * The editor preferences that follow a person between devices: controls
 * (mouse, trackpad, touch, pen) and custom keyboard shortcuts. The editor
 * keeps them on the device too; `updated_at` (ms) says which copy is newer.
 */
class PreferencesController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return response()->json(['data' => self::present($request->user()->preferences)]);
    }

    public function update(Request $request): JsonResponse
    {
        $request->validate([
            'controls' => ['present'],
            'shortcuts' => ['present'],
            'updated_at' => ['required', 'integer', 'min:0'],
        ]);
        // The raw JSON: empty objects and strings exactly as sent.
        $body = $request->json()->all();
        $controls = PreferenceRules::controls($body['controls'] ?? null);
        $shortcuts = PreferenceRules::shortcuts($body['shortcuts'] ?? null);
        $errors = array_filter([
            'controls' => is_string($controls) ? [$controls] : null,
            'shortcuts' => is_string($shortcuts) ? [$shortcuts] : null,
        ]);
        if ($errors) {
            throw ValidationException::withMessages($errors);
        }
        $prefs = ['controls' => $controls, 'shortcuts' => $shortcuts, 'updated_at' => (int) $body['updated_at']];
        if (strlen(json_encode($prefs)) > PreferenceRules::MAX_BYTES) {
            throw ValidationException::withMessages(['controls' => ['The preferences are too large.']]);
        }
        $request->user()->forceFill(['preferences' => $prefs])->save();

        return response()->json(['data' => self::present($prefs)]);
    }

    /** Empty maps go out as JSON objects ({}), never lists. */
    private static function present(?array $prefs): array
    {
        return [
            'controls' => $prefs ? (object) self::objects($prefs['controls'] ?? []) : null,
            'shortcuts' => $prefs ? (object) ($prefs['shortcuts'] ?? []) : null,
            'updated_at' => $prefs['updated_at'] ?? 0,
        ];
    }

    private static function objects(array $controls): array
    {
        foreach (['touch', 'pen'] as $k) {
            if (isset($controls[$k]) && is_array($controls[$k])) {
                $controls[$k] = (object) $controls[$k];
            }
        }

        return $controls;
    }
}
