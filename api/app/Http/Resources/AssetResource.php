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
            'set_key' => $this->set_key,
            'category' => $this->category,
            'tags' => $this->tags ?? [],
            'mime' => $this->mime,
            'bytes' => $this->bytes,
            'width' => $this->width,
            'height' => $this->height,
            'color' => $this->color,
            'meta' => $this->meta ?? (object) [],
            'url' => app(FileUrls::class)->temporary($this->disk, $this->path),
            // A small preview; pictures uploaded before previews existed use their own.
            'thumb_url' => app(FileUrls::class)->temporary($this->disk, $this->thumb_path ?? $this->path),
            'created_at' => $this->created_at,
        ];
    }
}
