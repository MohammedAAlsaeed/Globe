<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Asset;
use App\Models\AssetPack;
use App\Models\Plan;
use App\Models\User;

/**
 * What a user's plan allows, and how much of it they use. Every limit is
 * enforced here, on the server — the web app only mirrors it for display.
 *
 * Downgrades never delete anything: over the map limit, existing maps stay
 * readable and editable; only creating new ones is blocked.
 */
class Entitlements
{
    /** The plan in force right now: the newest current subscription, else the default plan. */
    public function plan(User $user): Plan
    {
        return $user->subscriptions()
            ->current()
            ->with('plan')
            ->latest('starts_at')
            ->first()?->plan ?? Plan::default();
    }

    /** @return array{maps: int, upload_bytes: int} */
    public function usage(User $user): array
    {
        return [
            'maps' => $user->maps()->count(),
            'upload_bytes' => (int) Asset::query()
                ->whereIn('pack_id', $user->assetPacks()->select('id'))
                ->sum('bytes'),
        ];
    }

    public function ensureCanCreateMap(User $user): void
    {
        $max = $this->plan($user)->max_maps;
        if ($max !== null && $user->maps()->count() >= $max) {
            throw ApiException::planLimit('maps', $max);
        }
    }

    public function ensureCanExport(User $user, int $width, int $height): void
    {
        $max = $this->plan($user)->max_export_px;
        if (max($width, $height) > $max) {
            throw ApiException::planLimit('export_px', $max);
        }
    }

    public function ensureCanUpload(User $user, int $bytes): void
    {
        $quota = $this->plan($user)->upload_quota_bytes;
        if ($this->usage($user)['upload_bytes'] + $bytes > $quota) {
            throw ApiException::planLimit('upload_bytes', $quota);
        }
    }

    /** Whether the user may use a pack's assets (own packs always; admins
     * manage the whole official library). */
    public function canUsePack(User $user, AssetPack $pack): bool
    {
        return $pack->owner_id === $user->id || $user->isAdmin() || $pack->tier <= $this->plan($user)->tier;
    }
}
