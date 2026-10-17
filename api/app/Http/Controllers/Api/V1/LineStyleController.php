<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Resources\LineStyleResource;
use App\Models\LineStyle;
use App\Services\Entitlements;
use App\Support\LineRules;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

/**
 * Line Tool styles: the person's own (saved to their account, up to the
 * plan's `max_line_styles`) and the official ones admins publish. Official
 * styles above the plan's tier are listed as locked, without their look.
 */
class LineStyleController extends Controller
{
    public function __construct(private Entitlements $entitlements) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $styles = LineStyle::query()
            // Admins also see unpublished official styles (to prepare them).
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
            'data' => LineStyleResource::collection($styles)->resolve($request),
            'limits' => [
                'count' => $user->lineStyles()->count(),
                'max' => $this->entitlements->plan($user)->max_line_styles,
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
        if (! $official) {
            $this->entitlements->ensureCanSaveLineStyle($user);
        }

        $style = new LineStyle([
            'name' => $data['name'],
            'look' => $data['look'],
            'tier' => $official ? ($data['tier'] ?? 0) : 0,
            'published' => $official ? ($data['published'] ?? false) : true,
            'sort' => $data['sort'] ?? 0,
        ]);
        $style->owner()->associate($official ? null : $user);
        $style->save();

        return (new LineStyleResource($style))->response()->setStatusCode(201);
    }

    public function update(Request $request, LineStyle $lineStyle): LineStyleResource
    {
        Gate::authorize('manage', $lineStyle);
        $rules = [
            'name' => ['sometimes', 'string', 'max:60'],
            'look' => ['sometimes', 'array', $this->lookRule()],
            'sort' => ['sometimes', 'integer', 'between:0,65535'],
        ];
        if ($lineStyle->isOfficial()) {
            $rules += ['tier' => ['sometimes', 'integer', 'between:0,9'], 'published' => ['sometimes', 'boolean']];
        }
        $lineStyle->update($request->validate($rules));

        return new LineStyleResource($lineStyle);
    }

    public function destroy(LineStyle $lineStyle): Response
    {
        Gate::authorize('manage', $lineStyle);
        $lineStyle->delete();

        return response()->noContent();
    }

    /** The look must be exactly what the editor can draw (see LineRules). */
    private function lookRule(): Closure
    {
        return function (string $attribute, mixed $value, Closure $fail) {
            if (strlen((string) json_encode($value)) > 16384) {
                $fail('The look is too large.');

                return;
            }
            if (($error = LineRules::lookError($value)) !== null) {
                $fail($error);
            }
        };
    }
}
