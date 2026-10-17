<?php

namespace App\Http\Resources;

use App\Models\Plan;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Plan */
class PlanResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'code' => $this->code,
            'name' => $this->name,
            'tier' => $this->tier,
            'max_maps' => $this->max_maps,
            'max_export_px' => $this->max_export_px,
            'upload_quota_bytes' => $this->upload_quota_bytes,
            'max_line_styles' => $this->max_line_styles,
            'commercial_use' => $this->commercial_use,
        ];
    }
}
