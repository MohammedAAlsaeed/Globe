<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Exceptions\ApiException;
use App\Services\Totp;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

/**
 * The admin panel's door: who is asking (their role and permissions) and
 * two-factor sign-in — set up once with an authenticator app (with recovery
 * codes for a lost phone), then a code per session and before sensitive
 * changes (see EnsureAdminTwoFactor).
 */
class TwoFactorController extends AdminController
{
    /** Wrong codes allowed before a pause, and how long the pause lasts. */
    private const MAX_FAILURES = 5;

    private const LOCKOUT_SECONDS = 900;

    public function __construct(private Totp $totp) {}

    /** The panel's state for this person and this session. */
    public function session(Request $request): JsonResponse
    {
        $user = $request->user();
        $at = (int) $request->session()->get('admin_2fa_at', 0);
        $open = $user->hasTwoFactor() && $at > 0 && time() - $at <= config('idrisi.admin.two_factor_hours') * 3600;

        return response()->json(['data' => [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role->value,
            'permissions' => $user->role->permissions(),
            'two_factor' => [
                'enabled' => $user->hasTwoFactor(),
                'verified' => $open,
                // Until when sensitive changes go through without a new code (Unix seconds).
                'step_up_until' => $open ? $at + config('idrisi.admin.step_up_minutes') * 60 : null,
                'recovery_codes_left' => $user->hasTwoFactor() ? count($user->two_factor_recovery_codes ?? []) : null,
            ],
        ]]);
    }

    /** Starts setting up: a new secret for the authenticator app (not yet in force). */
    public function setup(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user->hasTwoFactor()) {
            throw new ApiException('two_factor_enabled', 'Two-factor sign-in is already set up.', 409);
        }
        $secret = $this->totp->newSecret();
        $user->forceFill(['two_factor_secret' => $secret, 'two_factor_confirmed_at' => null])->save();

        return response()->json(['data' => [
            'secret' => $secret,
            'uri' => $this->totp->uri($secret, $user->email, config('idrisi.admin.issuer')),
        ]]);
    }

    /** Finishes setting up with a first code; returns the recovery codes (shown once). */
    public function confirm(Request $request): JsonResponse
    {
        $data = $request->validate(['code' => ['required', 'string', 'max:16']]);
        $user = $request->user();
        if ($user->hasTwoFactor() || ! $user->two_factor_secret) {
            throw new ApiException('two_factor_not_pending', 'Start the setup first.', 409);
        }
        $this->ensureNotLockedOut($user->id);
        if (! $this->totp->verify($user->two_factor_secret, $data['code'], $user->id)) {
            RateLimiter::hit($this->failKey($user->id), self::LOCKOUT_SECONDS);
            throw new ApiException('invalid_code', 'That code is not right. Check your phone’s clock and try the newest code.', 422);
        }
        RateLimiter::clear($this->failKey($user->id));
        $codes = $this->newRecoveryCodes($user);
        $user->forceFill(['two_factor_confirmed_at' => now()])->save();
        $request->session()->put('admin_2fa_at', time());
        $this->audit()->log('two_factor.enabled', $user);

        return response()->json(['data' => ['recovery_codes' => $codes]]);
    }

    /** Opens the panel for this session (a code, or one recovery code). */
    public function verify(Request $request): Response
    {
        $data = $request->validate([
            'code' => ['required_without:recovery_code', 'nullable', 'string', 'max:16'],
            'recovery_code' => ['required_without:code', 'nullable', 'string', 'max:32'],
        ]);
        $user = $request->user();
        if (! $user->hasTwoFactor()) {
            throw new ApiException('two_factor_setup_required', 'Set up two-factor sign-in first.', 403);
        }
        $this->ensureNotLockedOut($user->id);
        if (! empty($data['code'])) {
            $ok = $this->totp->verify($user->two_factor_secret, $data['code'], $user->id);
        } else {
            $ok = $this->useRecoveryCode($user, (string) $data['recovery_code']);
            if ($ok) {
                $this->audit()->log('two_factor.recovery_code_used', $user, meta: ['left' => count($user->two_factor_recovery_codes ?? [])]);
            }
        }
        if (! $ok) {
            RateLimiter::hit($this->failKey($user->id), self::LOCKOUT_SECONDS);
            $this->audit()->log('two_factor.failed', $user);
            throw new ApiException('invalid_code', 'That code is not right.', 422);
        }
        RateLimiter::clear($this->failKey($user->id));
        $request->session()->regenerate();
        $request->session()->put('admin_2fa_at', time());

        return response()->noContent();
    }

    /** New recovery codes (the old ones stop working). */
    public function recoveryCodes(Request $request): JsonResponse
    {
        $user = $request->user();
        $codes = $this->newRecoveryCodes($user);
        $user->save();
        $this->audit()->log('two_factor.recovery_codes_renewed', $user);

        return response()->json(['data' => ['recovery_codes' => $codes]]);
    }

    /** Closes the panel for this session (the next visit asks for a code). */
    public function lock(Request $request): Response
    {
        $request->session()->forget('admin_2fa_at');

        return response()->noContent();
    }

    private function failKey(string $userId): string
    {
        return "admin-2fa-failures:{$userId}";
    }

    private function ensureNotLockedOut(string $userId): void
    {
        if (RateLimiter::tooManyAttempts($this->failKey($userId), self::MAX_FAILURES)) {
            throw new ApiException('too_many_attempts', 'Too many wrong codes. Try again later.', 429, [
                'retry_after' => RateLimiter::availableIn($this->failKey($userId)),
            ]);
        }
    }

    /** @return list<string> */
    private function newRecoveryCodes($user): array
    {
        $codes = [];
        for ($i = 0; $i < 8; $i++) {
            $codes[] = strtolower(Str::random(5).'-'.Str::random(5));
        }
        $user->forceFill(['two_factor_recovery_codes' => array_map(fn ($c) => Hash::make($c), $codes)]);

        return $codes;
    }

    private function useRecoveryCode($user, string $code): bool
    {
        $code = strtolower(trim($code));
        $hashes = $user->two_factor_recovery_codes ?? [];
        foreach ($hashes as $i => $hash) {
            if (Hash::check($code, $hash)) {
                unset($hashes[$i]);
                $user->forceFill(['two_factor_recovery_codes' => array_values($hashes)])->save();

                return true;
            }
        }

        return false;
    }
}
