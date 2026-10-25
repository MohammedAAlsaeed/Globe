<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ShapeStyleResource;
use App\Models\ShapeStyle;
use App\Models\User;
use App\Services\Entitlements;
use App\Support\ShapeRules;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

/**
 * Shape Tool styles: the person's own (saved to their account, up to the
 * plan's `max_shape_styles`) and the official ones admins publish. Official
 * styles above the plan's tier are listed as locked, without their look.
 */
class ShapeStyleController extends Controller
{
    public function __construct(private Entitlements $entitlements) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $styles = ShapeStyle::query()
            ->when(
                $user->isAdmin(),
                fn ($q) => $q->where(fn ($o) => $o->whereNull('owner_id')->orWhere('owner_id', $user->id)),
                fn ($q) => $q->visibleTo($user),
            )
            ->orderByRaw('owner_id is null desc')
            ->orderBy('sort')
            ->orderBy('created_at')
            ->get();

        return response()->json([
            'data' => ShapeStyleResource::collection($styles)->resolve($request),
            'limits' => [
                'count' => $user->shapeStyles()->count(),
                'max' => $this->entitlements->plan($user)->max_shape_styles,
            ],
        ]);
    }

    /** Saves a style: the person's own, or (admins, `official: true`) an official one. */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'name' => ['required', 'string', 'max:60'],
            'look' => ['required', 'array', $this->lookRule()],
            'official' => ['sometimes', 'boolean'],
            'tier' => ['sometimes', 'integer', 'between:0,9'],
            'published' => ['sometimes', 'boolean'],
            'sort' => ['sometimes', 'integer', 'between:0,65535'],
        ]);
        $official = (bool) ($data['official'] ?? false);
        if ($official && ! $user->isAdmin()) {
            abort(403);
        }

        $style = DB::transaction(function () use ($user, $data, $official) {
            if (! $official) {
                // Saves from several tabs wait for each other, so the limit holds.
                User::query()->whereKey($user->getKey())->lockForUpdate()->first();
                $this->entitlements->ensureCanSaveShapeStyle($user);
            }

            $style = new ShapeStyle([
                'name' => $data['name'],
                'look' => $data['look'],
                'tier' => $official ? ($data['tier'] ?? 0) : 0,
                'published' => $official ? ($data['published'] ?? false) : true,
                'sort' => $data['sort'] ?? 0,
            ]);
            $style->owner()->associate($official ? null : $user);
            $style->save();

            return $style;
        });

        return (new ShapeStyleResource($style))->response()->setStatusCode(201);
    }

    public function update(Request $request, ShapeStyle $shapeStyle): ShapeStyleResource
    {
        Gate::authorize('manage', $shapeStyle);
        $rules = [
            'name' => ['sometimes', 'string', 'max:60'],
            'look' => ['sometimes', 'array', $this->lookRule()],
            'sort' => ['sometimes', 'integer', 'between:0,65535'],
        ];
        if ($shapeStyle->isOfficial()) {
            $rules += ['tier' => ['sometimes', 'integer', 'between:0,9'], 'published' => ['sometimes', 'boolean']];
        }
        $shapeStyle->update($request->validate($rules));

        return new ShapeStyleResource($shapeStyle);
    }

    public function destroy(ShapeStyle $shapeStyle): Response
    {
        Gate::authorize('manage', $shapeStyle);
        $shapeStyle->delete();

        return response()->noContent();
    }

    /** The look must be exactly what the editor can draw (see ShapeRules). */
    private function lookRule(): Closure
    {
        return function (string $attribute, mixed $value, Closure $fail) {
            if (strlen((string) json_encode($value)) > 16384) {
                $fail('The look is too large.');

                return;
            }
            if (($error = ShapeRules::lookError($value)) !== null) {
                $fail($error);
            }
        };
    }
}
