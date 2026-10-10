<?php

namespace App\Policies;

use App\Models\Map;
use App\Models\User;

/** Maps are private to their owner. */
class MapPolicy
{
    public function view(User $user, Map $map): bool
    {
        return $map->user_id === $user->id;
    }

    public function update(User $user, Map $map): bool
    {
        return $map->user_id === $user->id;
    }

    public function delete(User $user, Map $map): bool
    {
        return $map->user_id === $user->id;
    }
}
