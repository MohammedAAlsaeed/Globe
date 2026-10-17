<?php

namespace App\Policies;

use App\Models\LineStyle;
use App\Models\User;

/**
 * People see published official styles and their own, and manage their own.
 * Admins manage the official styles (drafts included).
 */
class LineStylePolicy
{
    public function view(User $user, LineStyle $style): bool
    {
        return $style->owner_id === $user->id
            || ($style->isOfficial() && ($style->published || $user->isAdmin()));
    }

    public function manage(User $user, LineStyle $style): bool
    {
        return $style->owner_id === $user->id || ($style->isOfficial() && $user->isAdmin());
    }
}
