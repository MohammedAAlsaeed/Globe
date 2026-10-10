<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A sign-in identity from an external provider (Google…) linked to a user. */
#[Fillable(['provider', 'provider_id'])]
class SocialAccount extends Model
{
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
