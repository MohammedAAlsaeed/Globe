<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\AssetKind;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AssetCatalog;
use Illuminate\Http\JsonResponse;

/**
 * The Stamp Catalog in one answer (see AssetCatalog): every stamp pack the
 * person can see and every stamp in it, with its set (`set_key`: stamps
 * sharing one are variants of one stamp), category, tags, how it is placed
 * by default (`meta`) and a small preview. The editor downloads a stamp's
 * picture only when it is drawn.
 */
class StampLibraryController extends Controller
{
    public function __invoke(AssetCatalog $catalog): JsonResponse
    {
        $user = auth('sanctum')->user();
        $user = $user instanceof User ? $user : null;
        ['packs' => $packs, 'assets' => $assets, 'locked' => $locked] = $catalog->load(AssetKind::Stamps, $user);

        return response()->json([
            'data' => [
                'packs' => $packs->map(fn ($p) => $catalog->pack($p, $user, $locked[$p->id]))->all(),
                'stamps' => $assets->map(fn ($a) => [
                    ...$catalog->asset($a, $locked[$a->pack_id]),
                    'set_key' => $a->set_key,
                ])->all(),
            ],
        ]);
    }
}
