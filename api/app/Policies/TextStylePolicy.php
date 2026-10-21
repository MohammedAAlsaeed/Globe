<?php

namespace App\Policies;

use App\Models\TextStyle;
use App\Models\User;

/**
 * People see published official text styles and their own, and manage their
 * own. Admins manage the official styles (drafts included).
 */
class TextStylePolicy
{
    public function view(User $user, TextStyle $style): bool
    {
        return $style->owner_id === $user->id
            || ($style->isOfficial() && ($style->published || $user->isAdmin()));
    }

    public function manage(User $user, TextStyle $style): bool
    {
        return $style->owner_id === $user->id || ($style->isOfficial() && $user->isAdmin());
    }
}
