<?php

namespace App\Models;

use App\Enums\AssetKind;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/** A group of stamps or textures: the official library (no owner) or a user's uploads. */
#[Fillable(['name', 'kind', 'tier', 'published', 'sort'])]
class AssetPack extends Model
{
    use HasUlids;

    protected function casts(): array
    {
        return ['kind' => AssetKind::class, 'tier' => 'integer', 'published' => 'boolean'];
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function assets(): HasMany
    {
        return $this->hasMany(Asset::class, 'pack_id');
    }

    /** The pack's first asset, shown as its preview. */
    public function cover(): HasOne
    {
        return $this->hasOne(Asset::class, 'pack_id')->oldestOfMany();
    }

    public function isOfficial(): bool
    {
        return $this->owner_id === null;
    }

    /** Packs a user can see: the published official library plus their own. */
    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        return $query->where(fn (Builder $q) => $q
            ->where(fn (Builder $o) => $o->whereNull('owner_id')->where('published', true))
            ->orWhere('owner_id', $user->id));
    }
}
