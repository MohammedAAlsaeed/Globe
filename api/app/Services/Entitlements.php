<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\Asset;
use App\Models\AssetPack;
use App\Models\LineStyle;
use App\Models\Plan;
use App\Models\ShapeStyle;
use App\Models\Subscription;
use App\Models\TextStyle;
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
    /**
     * The plan in force right now: the best of the current subscriptions
     * (highest tier, then the newest), else the default plan. A gift never
     * lowers what someone pays for.
     */
    public function plan(User $user): Plan
    {
        return static::best($user->subscriptions()->current()->with('plan')->get()) ?? Plan::default();
    }

    /** @param  iterable<Subscription>  $current  current subscriptions with their plans */
    public static function best(iterable $current): ?Plan
    {
        $best = null;
        foreach ($current as $s) {
            if ($best === null || $s->plan->tier > $best->plan->tier
                || ($s->plan->tier === $best->plan->tier && $s->starts_at > $best->starts_at)) {
                $best = $s;
            }
        }

        return $best?->plan;
    }

    /** @return array{maps: int, upload_bytes: int, line_styles: int, text_styles: int, shape_styles: int} */
    public function usage(User $user): array
    {
        return [
            'maps' => $user->maps()->count(),
            'upload_bytes' => (int) Asset::query()
                ->whereIn('pack_id', $user->assetPacks()->select('id'))
                ->sum('bytes'),
            'line_styles' => $user->lineStyles()->count(),
            'text_styles' => $user->textStyles()->count(),
            'shape_styles' => $user->shapeStyles()->count(),
        ];
    }

    public function ensureCanCreateMap(User $user): void
    {
        $plan = $this->plan($user);
        $max = $plan->max_maps;
        if ($max !== null && $user->maps()->count() >= $max) {
            throw ApiException::planLimit('maps', $max, $plan->code);
        }
    }

    public function ensureCanExport(User $user, int $width, int $height): void
    {
        $plan = $this->plan($user);
        $max = $plan->max_export_px;
        if (max($width, $height) > $max) {
            throw ApiException::planLimit('export_px', $max, $plan->code);
        }
    }

    public function ensureCanUpload(User $user, int $bytes): void
    {
        $plan = $this->plan($user);
        $quota = $plan->upload_quota_bytes;
        if ($this->usage($user)['upload_bytes'] + $bytes > $quota) {
            throw ApiException::planLimit('upload_bytes', $quota, $plan->code);
        }
    }

    /**
     * Own line styles are capped per plan. Only the person's own styles
     * count (official ones never do), and a downgrade deletes nothing: over
     * the new limit, existing styles stay usable; only saving more is blocked.
     */
    public function ensureCanSaveLineStyle(User $user): void
    {
        $plan = $this->plan($user);
        $max = $plan->max_line_styles;
        if ($max !== null && $user->lineStyles()->count() >= $max) {
            throw ApiException::planLimit('line_styles', $max, $plan->code);
        }
    }

    /**
     * Own text styles are capped per plan, like line styles: official ones
     * never count, and a downgrade deletes nothing — only saving more is blocked.
     */
    public function ensureCanSaveTextStyle(User $user): void
    {
        $plan = $this->plan($user);
        $max = $plan->max_text_styles;
        if ($max !== null && $user->textStyles()->count() >= $max) {
            throw ApiException::planLimit('text_styles', $max, $plan->code);
        }
    }

    /**
     * Own shape styles are capped per plan, like line and text styles:
     * official ones never count, and a downgrade deletes nothing.
     */
    public function ensureCanSaveShapeStyle(User $user): void
    {
        $plan = $this->plan($user);
        $max = $plan->max_shape_styles;
        if ($max !== null && $user->shapeStyles()->count() >= $max) {
            throw ApiException::planLimit('shape_styles', $max, $plan->code);
        }
    }

    /** Whether the user may use a shape style's look (own styles always; admins all). */
    public function canUseShapeStyle(User $user, ShapeStyle $style): bool
    {
        return $style->owner_id === $user->id || $user->isAdmin() || $style->tier <= $this->plan($user)->tier;
    }

    /** Whether the user may use a text style's look (own styles always; admins all). */
    public function canUseTextStyle(User $user, TextStyle $style): bool
    {
        return $style->owner_id === $user->id || $user->isAdmin() || $style->tier <= $this->plan($user)->tier;
    }

    /** Whether the user may use a style's look (own styles always; admins all). */
    public function canUseLineStyle(User $user, LineStyle $style): bool
    {
        return $style->owner_id === $user->id || $user->isAdmin() || $style->tier <= $this->plan($user)->tier;
    }

    /** Whether the user may use a pack's assets (own packs always; admins
     * manage the whole official library). */
    public function canUsePack(User $user, AssetPack $pack): bool
    {
        return $pack->owner_id === $user->id || $user->isAdmin() || $pack->tier <= $this->plan($user)->tier;
    }
}
