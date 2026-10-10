<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\AssetResource;
use App\Models\Asset;
use App\Models\AssetPack;
use App\Services\Entitlements;
use App\Services\Regions;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;

/** Uploading and removing assets in a pack the user manages. */
class AssetController extends Controller
{
    /**
     * Uploads one image. Raster formats only: SVG can carry scripts, so it is
     * not accepted from users.
     */
    public function store(Request $request, AssetPack $pack, Entitlements $entitlements, Regions $regions): AssetResource
    {
        Gate::authorize('manage', $pack);
        $data = $request->validate([
            'file' => ['required', 'image', 'mimes:png,webp,jpeg', 'max:'.config('idrisi.assets.max_upload_kb')],
            'name' => ['sometimes', 'string', 'max:80'],
            'tags' => ['sometimes', 'array', 'max:20'],
            'tags.*' => ['string', 'max:32'],
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
            'name' => $data['name'] ?? pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME),
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

    public function destroy(Asset $asset): Response
    {
        Gate::authorize('manage', $asset->pack);
        $asset->deleteWithFile();

        return response()->noContent();
    }
}
