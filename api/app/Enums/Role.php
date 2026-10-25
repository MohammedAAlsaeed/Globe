<?php

namespace App\Enums;

/**
 * Platform role. Separate from the subscription plan: staff may be on any
 * plan. Each role is a fixed set of permissions (see `permissions()`); every
 * admin endpoint checks a permission, never a role, so a role can be widened
 * or narrowed in one place.
 *
 *   owner    everything, including the staff themselves and the plans
 *   admin    people, subscriptions, maps and the official library
 *   editor   the official library (packs and styles) only
 *   support  looks people up, extends plans; changes nothing else
 */
enum Role: string
{
    case User = 'user';
    case Support = 'support';
    case Editor = 'editor';
    case Admin = 'admin';
    case Owner = 'owner';

    /** @return list<string> */
    public function permissions(): array
    {
        return match ($this) {
            self::User => [],
            self::Support => [
                'stats.view', 'users.view', 'subscriptions.view', 'subscriptions.grant', 'maps.view', 'plans.view',
            ],
            self::Editor => ['stats.view', 'content.manage', 'plans.view'],
            self::Admin => [
                'stats.view', 'users.view', 'users.manage', 'users.suspend', 'users.delete',
                'subscriptions.view', 'subscriptions.grant', 'subscriptions.manage',
                'plans.view', 'content.manage', 'maps.view', 'maps.manage', 'audit.view',
            ],
            self::Owner => Permission::ALL,
        };
    }

    public function can(string $permission): bool
    {
        return in_array($permission, $this->permissions(), true);
    }

    public function isStaff(): bool
    {
        return $this !== self::User;
    }

    /** Rank, so nobody acts on someone above (or, for staff, level with) them. */
    public function rank(): int
    {
        return match ($this) {
            self::User => 0,
            self::Support => 1,
            self::Editor => 2,
            self::Admin => 3,
            self::Owner => 4,
        };
    }
}
