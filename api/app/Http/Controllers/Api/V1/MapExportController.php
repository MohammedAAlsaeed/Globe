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
 *
 * Every export by a signed-in user comes here — of a cloud map (`forMap`) or
 * of a map kept only on the device (`store`, no map). Maps are drawn and
 * rendered in the browser, so this is the plan's check, not a guarantee:
 * guests (no account) are held to the guest size in the browser alone.
 */
class MapExportController extends Controller
{
    /** An export of a map that isn't in the cloud. */
    public function store(Request $request, Entitlements $entitlements): JsonResponse
    {
        return $this->record($request, $entitlements, null);
    }

    /** An export of a cloud map. */
    public function forMap(Request $request, Map $map, Entitlements $entitlements): JsonResponse
    {
        Gate::authorize('view', $map);

        return $this->record($request, $entitlements, $map);
    }

    private function record(Request $request, Entitlements $entitlements, ?Map $map): JsonResponse
    {
        $data = $request->validate([
            'width' => ['required', 'integer', 'between:1,100000'],
            'height' => ['required', 'integer', 'between:1,100000'],
        ]);
        $user = $request->user();
        $entitlements->ensureCanExport($user, $data['width'], $data['height']);
        $plan = $entitlements->plan($user);

        $export = $user->exports()->create([
            'map_id' => $map?->id,
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
