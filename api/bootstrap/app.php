<?php

use App\Http\Middleware\AccountGuard;
use App\Http\Middleware\EnsureAdminTwoFactor;
use App\Http\Middleware\EnsureStaff;
use App\Http\Middleware\RequirePermission;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        apiPrefix: 'api/v1',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Sanctum SPA: requests from the web app's origin get session cookies.
        $middleware->statefulApi();
        // Suspended accounts and ended sessions are signed out at once.
        $middleware->api(append: [AccountGuard::class]);
        $middleware->alias([
            'staff' => EnsureStaff::class,
            'admin.2fa' => EnsureAdminTwoFactor::class,
            'permission' => RequirePermission::class,
        ]);
        // Signed-in users hitting guest-only routes, and guests hitting
        // protected ones, are sent to the web app (API clients get JSON).
        $middleware->redirectUsersTo(fn () => config('idrisi.frontend_url'));
        $middleware->redirectGuestsTo(fn () => config('idrisi.frontend_url').'/login');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
