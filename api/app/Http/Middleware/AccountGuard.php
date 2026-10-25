<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/**
 * Runs on every API request of a signed-in person:
 *
 *   suspended         a suspended account is signed out and refused, at
 *                     once and on every device
 *   ended sessions    staff can end all of someone's sessions: the account's
 *                     session version is bumped, and any session that began
 *                     under an older version is signed out
 *   last seen         remembered (at most every 5 minutes) for the admin panel
 */
class AccountGuard
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = Auth::guard('sanctum')->user();
        if (! $user) {
            return $next($request);
        }
        if ($request->hasSession()) {
            $known = $request->session()->get('session_version');
            if ($known === null) {
                $request->session()->put('session_version', (int) $user->session_version);
            } elseif ((int) $known !== (int) $user->session_version) {
                $this->signOut($request);

                return response()->json(['message' => 'Your session has ended. Please sign in again.', 'code' => 'session_ended'], 401);
            }
        }
        if ($user->isSuspended()) {
            $this->signOut($request);
            $token = $user->currentAccessToken();
            if ($token instanceof PersonalAccessToken) {
                $token->delete();
            }

            return response()->json([
                'message' => 'This account is suspended.',
                'code' => 'account_suspended',
                'reason' => $user->suspended_reason,
            ], 403);
        }
        if (! $user->last_seen_at || $user->last_seen_at->lt(now()->subMinutes(5))) {
            $user->forceFill(['last_seen_at' => now()])->saveQuietly();
        }

        return $next($request);
    }

    private function signOut(Request $request): void
    {
        if ($request->hasSession()) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }
    }
}
