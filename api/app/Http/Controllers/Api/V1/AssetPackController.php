<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\AssetKind;
use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Resources\AssetPackResource;
use App\Http\Resources\AssetResource;
use App\Models\AssetPack;
use App\Services\Entitlements;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * The asset library: official packs (locked when the plan doesn't include
 * them) and the user's own upload packs.
 */
class AssetPackController extends Controller
{
    public function __construct(private Entitlements $entitlements) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $data = $request->validate(['kind' => ['sometimes', Rule::enum(AssetKind::class)]]);
        $packs = AssetPack::query()
            ->visibleTo($request->user())
            ->when($data['kind'] ?? null, fn ($q, $kind) => $q->where('kind', $kind))
            ->withCount('assets')
            ->orderByRaw('owner_id is not null')
            ->orderBy('sort')
            ->orderBy('name')
            ->get();

        return AssetPackResource::collection($packs);
    }

    /** A pack's assets with short-lived URLs; locked packs are refused. */
    public function assets(Request $request, AssetPack $pack): AnonymousResourceCollection
    {
        Gate::authorize('view', $pack);
        if (! $this->entitlements->canUsePack($request->user(), $pack)) {
            throw ApiException::planLimit('tier', $pack->tier);
        }

        return AssetResource::collection($pack->assets()->orderBy('name')->get());
    }

    /**
     * Creates a pack: a personal upload pack, or — for admins with
     * `official: true` — a pack of the official library.
     */
    public function store(Request $request): AssetPackResource
    {
        $user = $request->user();
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'kind' => ['required', Rule::enum(AssetKind::class)],
            'official' => ['sometimes', 'boolean'],
            'tier' => ['sometimes', 'integer', 'between:0,9'],
            'published' => ['sometimes', 'boolean'],
        ]);
        $official = (bool) ($data['official'] ?? false);
        if ($official && ! $user->isAdmin()) {
            abort(403);
        }
        if (! $official && $this->entitlements->plan($user)->upload_quota_bytes === 0) {
            throw ApiException::planLimit('upload_bytes', 0);
        }

        $pack = new AssetPack([
            'name' => $data['name'],
            'kind' => $data['kind'],
            'tier' => $official ? ($data['tier'] ?? 0) : 0,
            'published' => $official ? ($data['published'] ?? false) : true,
        ]);
        $pack->owner()->associate($official ? null : $user);
        $pack->save();

        return new AssetPackResource($pack);
    }

    public function update(Request $request, AssetPack $pack): AssetPackResource
    {
        Gate::authorize('manage', $pack);
        $rules = ['name' => ['sometimes', 'string', 'max:80']];
        if ($pack->isOfficial()) {
            $rules += ['tier' => ['sometimes', 'integer', 'between:0,9'], 'published' => ['sometimes', 'boolean'], 'sort' => ['sometimes', 'integer', 'min:0']];
        }
        $pack->update($request->validate($rules));

        return new AssetPackResource($pack);
    }

    public function destroy(AssetPack $pack): Response
    {
        Gate::authorize('manage', $pack);
        foreach ($pack->assets as $asset) {
            $asset->deleteWithFile();
        }
        $pack->delete();

        return response()->noContent();
    }
}
