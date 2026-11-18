<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\Stamps;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * A person's favourite stamps: each a stamp set (and, optionally, one of its
 * variants) with the way they like it placed — size, turn, flips, colours,
 * opacity, shadow — kept with their account so every map and device has
 * them. The editor also keeps a copy on the device; `updated_at` (ms) says
 * which copy is newer.
 */
class StampFavoritesController extends Controller
{
    public const MAX = 60;

    public function show(Request $request): JsonResponse
    {
        return response()->json(['data' => self::present($request->user()->stamp_favorites)]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'items' => ['present', 'array', 'max:'.self::MAX],
            'items.*' => ['array'],
            'items.*.id' => ['required', 'string', 'max:40', 'regex:/^[\w-]+$/'],
            // A set: "mountain" (built in), "s:<pack>:<set>" (uploaded)…
            'items.*.set' => ['required', 'string', 'max:120', 'regex:/^[\w:.-]+$/'],
            'items.*.variant' => ['present', 'nullable', 'integer', 'between:0,999'],
            'items.*.look' => ['required', 'array'],
            ...Stamps::lookRules('items.*.look'),
            'updated_at' => ['required', 'integer', 'min:0'],
        ]);
        $items = [];
        foreach ($data['items'] as $i => $item) {
            // The raw look as sent: numbers stay numbers.
            $look = (array) $request->json('items.'.$i.'.look');
            $items[] = [
                'id' => $item['id'],
                'set' => $item['set'],
                'variant' => $item['variant'],
                'look' => array_intersect_key($look, array_flip(Stamps::LOOK_FIELDS)),
            ];
        }
        $favorites = ['items' => $items, 'updated_at' => (int) $data['updated_at']];
        $request->user()->forceFill(['stamp_favorites' => $favorites])->save();

        return response()->json(['data' => self::present($favorites)]);
    }

    private static function present(?array $favorites): array
    {
        return [
            'items' => $favorites['items'] ?? [],
            'updated_at' => $favorites['updated_at'] ?? 0,
        ];
    }
}
