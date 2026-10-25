<?php

namespace App\Http\Resources;

use App\Models\User;
use App\Services\Entitlements;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The signed-in user, with their plan and usage — everything the web app
 * needs to show limits.
 *
 * @mixin User
 */
class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $entitlements = app(Entitlements::class);

        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'email_verified' => $this->email_verified_at !== null,
            'has_password' => $this->password !== null,
            'role' => $this->role->value,
            // What the admin panel lets this person do (empty for most people).
            'permissions' => $this->role->permissions(),
            'locale' => $this->locale,
            'region' => $this->region,
            'avatar_url' => $this->avatar_url,
            'plan' => new PlanResource($entitlements->plan($this->resource)),
            'usage' => $entitlements->usage($this->resource),
            'created_at' => $this->created_at,
        ];
    }
}
