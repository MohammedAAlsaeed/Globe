<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A Text Tool style: a person's own (owner set) or official (no owner,
 * published by admins, usable from plan tier `tier` up).
 *
 * @property array<string, mixed> $look
 */
#[Fillable(['name', 'look', 'tier', 'published', 'sort'])]
class TextStyle extends Model
{
    use HasUlids;

    protected function casts(): array
    {
        return ['look' => 'array', 'tier' => 'integer', 'published' => 'boolean', 'sort' => 'integer'];
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function isOfficial(): bool
    {
        return $this->owner_id === null;
    }

    /** Styles a user can see: the published official ones plus their own. */
    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        return $query->where(fn (Builder $q) => $q
            ->where(fn (Builder $o) => $o->whereNull('owner_id')->where('published', true))
            ->orWhere('owner_id', $user->id));
    }
}
