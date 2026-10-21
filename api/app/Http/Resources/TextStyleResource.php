<?php

namespace App\Http\Resources;

use App\Models\TextStyle;
use App\Services\Entitlements;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin TextStyle */
class TextStyleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $locked = ! app(Entitlements::class)->canUseTextStyle($request->user(), $this->resource);

        return [
            'id' => $this->id,
            'name' => $this->name,
            // A locked style is listed (to show what a plan includes) without its look.
            'look' => $locked ? null : $this->look,
            'official' => $this->isOfficial(),
            'tier' => $this->tier,
            'published' => $this->published,
            'locked' => $locked,
            'sort' => $this->sort,
        ];
    }
}
