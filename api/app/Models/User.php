<?php

namespace App\Models;

use App\Enums\Role;
use Database\Factories\UserFactory;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'email', 'password', 'locale', 'region', 'avatar_url'])]
#[Hidden(['password', 'remember_token', 'two_factor_secret', 'two_factor_recovery_codes'])]
class User extends Authenticatable implements MustVerifyEmail
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, HasUlids, Notifiable;

    /** Database defaults, mirrored so a freshly created model has them too. */
    protected $attributes = [
        'role' => 'user',
        'locale' => 'ar',
        'region' => 'global',
        'session_version' => 0,
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'role' => Role::class,
            'preferences' => 'array',
            'two_factor_secret' => 'encrypted',
            'two_factor_recovery_codes' => 'encrypted:array',
            'two_factor_confirmed_at' => 'datetime',
            'suspended_at' => 'datetime',
            'session_version' => 'integer',
            'last_seen_at' => 'datetime',
        ];
    }

    /**
     * Manages the official library (packs and styles) — what "admin" meant
     * before staff roles: owners, admins and editors.
     */
    public function isAdmin(): bool
    {
        return $this->hasPermission('content.manage');
    }

    /** Anyone with a staff role (who may open the admin panel). */
    public function isStaff(): bool
    {
        return $this->role->isStaff();
    }

    public function hasPermission(string $permission): bool
    {
        return $this->role->can($permission);
    }

    public function isSuspended(): bool
    {
        return $this->suspended_at !== null;
    }

    public function hasTwoFactor(): bool
    {
        return $this->two_factor_confirmed_at !== null && $this->two_factor_secret !== null;
    }

    public function maps(): HasMany
    {
        return $this->hasMany(Map::class);
    }

    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class);
    }

    public function socialAccounts(): HasMany
    {
        return $this->hasMany(SocialAccount::class);
    }

    public function exports(): HasMany
    {
        return $this->hasMany(Export::class);
    }

    public function assetPacks(): HasMany
    {
        return $this->hasMany(AssetPack::class, 'owner_id');
    }

    public function lineStyles(): HasMany
    {
        return $this->hasMany(LineStyle::class, 'owner_id');
    }

    public function textStyles(): HasMany
    {
        return $this->hasMany(TextStyle::class, 'owner_id');
    }

    public function shapeStyles(): HasMany
    {
        return $this->hasMany(ShapeStyle::class, 'owner_id');
    }
}
