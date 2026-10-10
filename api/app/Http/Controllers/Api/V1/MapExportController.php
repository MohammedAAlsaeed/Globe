<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Map;
use App\Services\Entitlements;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * Records an export before the editor renders it: checks the plan's maximum
 * resolution and stores the license in force (commercial use or not).
 */
class MapExportController extends Controller
{
    public function __invoke(Request $request, Map $map, Entitlements $entitlements): JsonResponse
    {
        Gate::authorize('view', $map);
        $data = $request->validate([
            'width' => ['required', 'integer', 'between:1,100000'],
            'height' => ['required', 'integer', 'between:1,100000'],
        ]);
        $user = $request->user();
        $entitlements->ensureCanExport($user, $data['width'], $data['height']);
        $plan = $entitlements->plan($user);

        $export = $user->exports()->create([
            'map_id' => $map->id,
            'plan_code' => $plan->code,
            'width' => $data['width'],
            'height' => $data['height'],
            'commercial_use' => $plan->commercial_use,
        ]);

        return response()->json(['data' => [
            'id' => $export->id,
            'plan' => $export->plan_code,
            'commercial_use' => $export->commercial_use,
            'created_at' => $export->created_at,
        ]], 201);
    }
}
