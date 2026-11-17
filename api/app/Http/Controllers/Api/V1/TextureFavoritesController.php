<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\Textures;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * A person's favourite textures: each a texture with the way they like it
 * drawn (scale, turn, offsets, colour adjustments), kept with their account
 * so every map and device has them. The editor also keeps a copy on the
 * device; `updated_at` (ms) says which copy is newer.
 */
class TextureFavoritesController extends Controller
{
    public const MAX = 60;

    public function show(Request $request): JsonResponse
    {
        return response()->json(['data' => self::present($request->user()->texture_favorites)]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'items' => ['present', 'array', 'max:'.self::MAX],
            'items.*' => ['array'],
            'items.*.id' => ['required', 'string', 'max:40', 'regex:/^[\w-]+$/'],
            'items.*.source' => ['required', 'array'],
            'updated_at' => ['required', 'integer', 'min:0'],
        ]);
        $items = [];
        foreach ($data['items'] as $i => $item) {
            // The raw source as sent: numbers stay numbers.
            $source = $request->json('items.'.$i.'.source');
            if (($error = Textures::sourceError($source)) !== null || ($source['type'] ?? null) !== 'texture') {
                throw ValidationException::withMessages(["items.{$i}.source" => [$error ?? 'A favourite must be a texture.']]);
            }
            $items[] = ['id' => $item['id'], 'source' => array_intersect_key($source, array_flip([
                'type', 'color', 'texture', 'textureScale', 'textureRotation', 'textureOffsetX', 'textureOffsetY',
                'hue', 'saturation', 'brightness', 'contrast',
            ]))];
        }
        $favorites = ['items' => $items, 'updated_at' => (int) $data['updated_at']];
        $request->user()->forceFill(['texture_favorites' => $favorites])->save();

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
