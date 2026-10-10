<?php

namespace App\Enums;

enum SubscriptionStatus: string
{
    case Active = 'active';
    /** Canceled by the user; still valid until its ends_at. */
    case Canceled = 'canceled';
    case Expired = 'expired';
}
