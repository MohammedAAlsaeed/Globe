<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\AssetKind;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AssetCatalog;
use Illuminate\Http\JsonResponse;

/**
 * The texture catalog in one answer (see AssetCatalog): every texture pack
 * the person can see and every texture in it, as metadata and small
 * previews — the editor downloads a texture's picture only when it is used.
 */
class TextureLibraryController extends Controller
{
    public function __invoke(AssetCatalog $catalog): JsonResponse
    {
        $user = auth('sanctum')->user();
        $user = $user instanceof User ? $user : null;
        ['packs' => $packs, 'assets' => $assets, 'locked' => $locked] = $catalog->load(AssetKind::Textures, $user);

        return response()->json([
            'data' => [
                'packs' => $packs->map(fn ($p) => $catalog->pack($p, $user, $locked[$p->id]))->all(),
                'textures' => $assets->map(fn ($a) => $catalog->asset($a, $locked[$a->pack_id]))->all(),
            ],
        ]);
    }
}
