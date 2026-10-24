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
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable implements MustVerifyEmail
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, HasUlids, Notifiable;

    /** Database defaults, mirrored so a freshly created model has them too. */
    protected $attributes = [
        'role' => 'user',
        'locale' => 'ar',
        'region' => 'global',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'role' => Role::class,
            'preferences' => 'array',
        ];
    }

    public function isAdmin(): bool
    {
        return $this->role === Role::Admin;
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
}
