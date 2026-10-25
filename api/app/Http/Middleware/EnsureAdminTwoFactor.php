<?php

namespace App\Http\Middleware;

use App\Services\AdminGate;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The admin panel asks for a two-factor code, whatever the sign-in method
 * (Google accounts included): once per session for a while, and again
 * shortly before sensitive changes (the `recent` parameter). See AdminGate.
 */
class EnsureAdminTwoFactor
{
    public function handle(Request $request, Closure $next, string $mode = 'session'): Response
    {
        if ($problem = AdminGate::problem($request, $request->user(), $mode)) {
            return response()->json($problem, 403);
        }

        return $next($request);
    }
}
