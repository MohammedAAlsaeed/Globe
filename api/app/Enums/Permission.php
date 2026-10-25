<?php

namespace App\Enums;

/** Every permission an admin endpoint can require (see Role::permissions). */
final class Permission
{
    public const ALL = [
        'stats.view',
        'users.view',
        'users.manage',
        'users.suspend',
        'users.delete',
        'staff.manage',
        'subscriptions.view',
        'subscriptions.grant',
        'subscriptions.manage',
        'plans.view',
        'plans.manage',
        'content.manage',
        'maps.view',
        'maps.manage',
        'maps.read',
        'audit.view',
    ];
}
