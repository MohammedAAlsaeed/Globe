<?php

namespace App\Policies;

use App\Models\AssetPack;
use App\Models\User;
use App\Services\AdminGate;

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
        if ($pack->owner_id === $user->id) {
            return true;
        }
        if (! $pack->isOfficial() || ! $user->isAdmin()) {
            return false;
        }
        // Checked up front, before an upload is stored (see OfficialContentObserver).
        AdminGate::ensure(request(), $user);

        return true;
    }
}
