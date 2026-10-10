<?php

namespace App\Http\Resources;

use App\Models\Map;
use App\Services\FileUrls;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** A map's metadata (the document is fetched separately). @mixin Map */
class MapResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'width' => $this->width,
            'height' => $this->height,
            'schema_version' => $this->schema_version,
            'revision' => $this->revision,
            'document_bytes' => $this->document_bytes,
            'thumbnail_url' => app(FileUrls::class)->temporary($this->disk, $this->thumbnail_path),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
