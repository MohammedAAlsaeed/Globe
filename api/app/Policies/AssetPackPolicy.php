<?php

namespace App\Policies;

use App\Models\AssetPack;
use App\Models\User;

/**
 * Users see the published official library and their own packs; they manage
 * their own packs. Admins manage the official library.
 */
class AssetPackPolicy
{
    public function view(User $user, AssetPack $pack): bool
    {
        return $pack->owner_id === $user->id
            || ($pack->isOfficial() && ($pack->published || $user->isAdmin()));
    }

    public function manage(User $user, AssetPack $pack): bool
    {
        return $pack->owner_id === $user->id || ($pack->isOfficial() && $user->isAdmin());
    }
}
