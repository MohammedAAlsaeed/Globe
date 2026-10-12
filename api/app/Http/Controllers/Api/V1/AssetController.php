<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\AssetResource;
use App\Models\Asset;
use App\Models\AssetPack;
use App\Models\User;
use App\Services\Entitlements;
use App\Services\Regions;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/** Uploading, organizing and removing assets in a pack the user manages. */
class AssetController extends Controller
{
    /** The Stamp Tool's catalog categories (official stamps are filed under one). */
    public const CATEGORIES = ['terrain', 'vegetation', 'settlements', 'water', 'symbols'];

    /**
     * Assets by id, for drawing maps that use them: the user's own and the
     * published official library. A pack above the user's plan still draws
     * what was placed while it was included (downgrades never break maps);
     * only placing new stamps from it is refused (see AssetPackController).
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $data = $request->validate([
            'ids' => ['required', 'array', 'max:200'],
            'ids.*' => ['string', 'size:26'],
        ]);
        $user = $request->user();
        $assets = Asset::query()
            ->whereIn('id', $data['ids'])
            ->whereHas('pack', fn (Builder $q) => $this->viewable($q, $user))
            ->get();

        return AssetResource::collection($assets);
    }

    /**
     * Uploads one image. Raster formats only: SVG can carry scripts, so it is
     * not accepted from users.
     */
    public function store(Request $request, AssetPack $pack, Entitlements $entitlements, Regions $regions): AssetResource
    {
        Gate::authorize('manage', $pack);
        $data = $request->validate([
            'file' => ['required', 'image', 'mimes:png,webp,jpeg', 'max:'.config('idrisi.assets.max_upload_kb')],
            ...$this->detailRules($pack),
        ]);
        $file = $request->file('file');
        $user = $request->user();
        if (! $pack->isOfficial()) {
            $entitlements->ensureCanUpload($user, $file->getSize());
        }

        // Official assets live on the default region's disk; user uploads on the owner's.
        $disk = $pack->isOfficial()
            ? config('regions.regions.'.config('regions.default').'.disk')
            : $regions->diskName($user);
        $owner = $pack->owner_id ?? 'library';
        $path = $file->storeAs("assets/{$owner}/{$pack->id}", Str::ulid().'.'.$file->extension(), $disk);
        [$width, $height] = getimagesize($file->getRealPath()) ?: [null, null];

        $asset = $pack->assets()->create([
            'name' => $data['name'] ?? Str::limit(pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME), 80, ''),
            'set_key' => $data['set_key'] ?? null,
            'category' => $data['category'] ?? null,
            'tags' => $data['tags'] ?? [],
            'disk' => $disk,
            'path' => $path,
            'mime' => $file->getMimeType(),
            'bytes' => $file->getSize(),
            'width' => $width,
            'height' => $height,
        ]);

        return new AssetResource($asset);
    }

    /** Renames an asset, moves it to another set, or (official) re-files it. */
    public function update(Request $request, Asset $asset): AssetResource
    {
        Gate::authorize('manage', $asset->pack);
        $asset->update($request->validate($this->detailRules($asset->pack)));

        return new AssetResource($asset);
    }

    public function destroy(Asset $asset): Response
    {
        Gate::authorize('manage', $asset->pack);
        $asset->deleteWithFile();

        return response()->noContent();
    }

    /** Name, set, tags — and the category, for official packs only. */
    private function detailRules(AssetPack $pack): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:80'],
            'set_key' => ['sometimes', 'nullable', 'string', 'max:40', 'regex:/^[\w-]+$/'],
            'tags' => ['sometimes', 'array', 'max:20'],
            'tags.*' => ['string', 'max:32'],
            ...($pack->isOfficial() ? ['category' => ['sometimes', 'nullable', Rule::in(self::CATEGORIES)]] : []),
        ];
    }

    /** Packs whose assets the user may draw (see AssetPackPolicy::view). */
    private function viewable(Builder $packs, User $user): Builder
    {
        return $user->isAdmin()
            ? $packs->where(fn (Builder $q) => $q->whereNull('owner_id')->orWhere('owner_id', $user->id))
            : $packs->visibleTo($user);
    }
}
