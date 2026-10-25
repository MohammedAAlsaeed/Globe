<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** `permission:users.manage` — the role must include the permission. */
class RequirePermission
{
    public function handle(Request $request, Closure $next, string ...$permissions): Response
    {
        $user = $request->user();
        foreach ($permissions as $p) {
            if (! $user?->hasPermission($p)) {
                return response()->json([
                    'message' => 'Your role does not allow this.',
                    'code' => 'forbidden',
                    'permission' => $p,
                ], 403);
            }
        }

        return $next($request);
    }
}
