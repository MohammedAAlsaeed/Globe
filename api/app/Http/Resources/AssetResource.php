<?php

namespace App\Http\Resources;

use App\Models\Asset;
use App\Services\FileUrls;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Asset */
class AssetResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'pack_id' => $this->pack_id,
            'name' => $this->name,
            'tags' => $this->tags ?? [],
            'mime' => $this->mime,
            'bytes' => $this->bytes,
            'width' => $this->width,
            'height' => $this->height,
            'url' => app(FileUrls::class)->temporary($this->disk, $this->path),
        ];
    }
}
