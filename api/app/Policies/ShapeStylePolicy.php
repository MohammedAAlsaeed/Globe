<?php

namespace App\Policies;

use App\Models\ShapeStyle;
use App\Models\User;

/**
 * People see published official shape styles and their own, and manage their
 * own. Admins manage the official styles (drafts included).
 */
class ShapeStylePolicy
{
    public function view(User $user, ShapeStyle $style): bool
    {
        return $style->owner_id === $user->id
            || ($style->isOfficial() && ($style->published || $user->isAdmin()));
    }

    public function manage(User $user, ShapeStyle $style): bool
    {
        return $style->owner_id === $user->id || ($style->isOfficial() && $user->isAdmin());
    }
}
