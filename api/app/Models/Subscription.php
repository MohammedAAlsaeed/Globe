<?php

namespace App\Models;

use App\Enums\SubscriptionStatus;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A user's subscription to a plan. Provider-agnostic: `provider` and
 * `provider_ref` point at whatever payment service created it.
 */
#[Fillable(['plan_id', 'status', 'provider', 'provider_ref', 'starts_at', 'ends_at', 'canceled_at'])]
class Subscription extends Model
{
    protected function casts(): array
    {
        return [
            'status' => SubscriptionStatus::class,
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'canceled_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }

    /** Subscriptions granting their plan right now (a canceled one runs to its end). */
    public function scopeCurrent(Builder $query): Builder
    {
        return $query
            ->whereIn('status', [SubscriptionStatus::Active, SubscriptionStatus::Canceled])
            ->where('starts_at', '<=', now())
            ->where(fn (Builder $q) => $q->whereNull('ends_at')->orWhere('ends_at', '>', now()));
    }
}
