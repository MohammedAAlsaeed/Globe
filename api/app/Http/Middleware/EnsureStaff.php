<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/**
 * The admin panel is for staff only (any role but "user"), signed in to the
 * web app: API tokens never open it (the two-factor check lives in the
 * session).
 */
class EnsureStaff
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user()?->isStaff()) {
            return response()->json(['message' => 'This area is for staff only.', 'code' => 'not_staff'], 403);
        }

        if (! $request->hasSession() || $request->user()->currentAccessToken() instanceof PersonalAccessToken) {
            return response()->json(['message' => 'Sign in to the web app to use the admin panel.', 'code' => 'session_required'], 403);
        }

        return $next($request);
    }
}
