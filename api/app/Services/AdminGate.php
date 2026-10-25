<?php

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * Whether a staff member's session has passed the admin two-factor check:
 * within `idrisi.admin.two_factor_hours` for the panel, and within
 * `idrisi.admin.step_up_minutes` (mode `recent`) for sensitive changes.
 * Used by the `admin.2fa` middleware and wherever staff change official
 * content from the editor itself.
 */
class AdminGate
{
    /** @return array{code: string, message: string}|null  null when allowed */
    public static function problem(Request $request, ?User $user, string $mode = 'session'): ?array
    {
        if (! $user?->hasTwoFactor()) {
            return ['code' => 'two_factor_setup_required', 'message' => 'Set up two-factor sign-in to use the admin panel.'];
        }
        $at = $request->hasSession() ? (int) $request->session()->get('admin_2fa_at', 0) : 0;
        $limit = $mode === 'recent'
            ? config('idrisi.admin.step_up_minutes') * 60
            : config('idrisi.admin.two_factor_hours') * 3600;
        if ($at <= 0 || time() - $at > $limit) {
            return $mode === 'recent'
                ? ['code' => 'step_up_required', 'message' => 'Confirm with a two-factor code to make this change.']
                : ['code' => 'two_factor_required', 'message' => 'Enter a two-factor code to continue.'];
        }

        return null;
    }

    public static function ensure(Request $request, ?User $user, string $mode = 'session'): void
    {
        if ($p = static::problem($request, $user, $mode)) {
            throw new ApiException($p['code'], $p['message'], 403);
        }
    }
}
