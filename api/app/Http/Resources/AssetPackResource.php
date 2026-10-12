<?php

namespace App\Http\Resources;

use App\Models\AssetPack;
use App\Services\Entitlements;
use App\Services\FileUrls;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin AssetPack */
class AssetPackResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'kind' => $this->kind->value,
            'tier' => $this->tier,
            'official' => $this->isOfficial(),
            'published' => $this->published,
            // Locked: visible in the library, but the plan doesn't include it.
            'locked' => ! app(Entitlements::class)->canUsePack($request->user(), $this->resource),
            'assets_count' => $this->whenCounted('assets'),
            // A preview picture, so a locked pack can still be shown.
            'cover_url' => $this->whenLoaded('cover', fn () => $this->cover
                ? app(FileUrls::class)->temporary($this->cover->disk, $this->cover->path)
                : null),
        ];
    }
}
