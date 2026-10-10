<?php

namespace App\Enums;

/** Platform role. Separate from the subscription plan: an admin may be on any plan. */
enum Role: string
{
    case User = 'user';
    case Admin = 'admin';
}
