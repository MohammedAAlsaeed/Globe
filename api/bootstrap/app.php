<?php

use App\Http\Middleware\AccountGuard;
use App\Http\Middleware\EnsureAdminTwoFactor;
use App\Http\Middleware\EnsureStaff;
use App\Http\Middleware\RequirePermission;
use App\Support\ErrorReference;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

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
        // Browser error reports carry no CSRF token (they are sent as the page
        // fails); the route only writes to the log, and is rate-limited.
        $middleware->validateCsrfTokens(except: ['api/v1/client-errors']);
        // Signed-in users hitting guest-only routes, and guests hitting
        // protected ones, are sent to the web app (API clients get JSON).
        $middleware->redirectUsersTo(fn () => config('idrisi.frontend_url'));
        $middleware->redirectGuestsTo(fn () => config('idrisi.frontend_url').'/login');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // Every logged error carries the reference shown to the person.
        $exceptions->context(fn () => ['reference' => ErrorReference::current()]);

        // HTTP errors get a stable `code` the web app can react to (and
        // translate), like ApiException's.
        $exceptions->render(function (HttpExceptionInterface $e, Request $request) {
            if (! ($request->is('api/*') || $request->expectsJson())) {
                return null;
            }
            $status = $e->getStatusCode();
            [$code, $message] = match ($status) {
                404 => ['not_found', 'Not found.'],
                405 => ['method_not_allowed', 'Method not allowed.'],
                429 => ['too_many_requests', 'Too many requests.'],
                503 => ['maintenance', $e->getMessage() ?: 'Down for maintenance.'],
                default => [null, null],
            };
            if ($code === null) {
                return null;
            }
            $headers = $e->getHeaders();
            $retry = (int) ($headers['Retry-After'] ?? 0);

            return response()->json(
                ['message' => $message, 'code' => $code] + ($retry > 0 ? ['retry_after' => $retry] : []),
                $status,
                $headers,
            );
        });

        // An unexpected error: a generic message and the reference that finds
        // it in the log (the details stay on the server unless debugging).
        $exceptions->respond(function (Response $response, Throwable $e, Request $request) {
            $status = $response->getStatusCode();
            if ($status < 500 || $status === 503 || config('app.debug')
                || ! ($request->is('api/*') || $request->expectsJson())) {
                return $response;
            }

            return response()->json([
                'message' => 'Something went wrong on our side.',
                'code' => 'server_error',
                'reference' => ErrorReference::current(),
            ], $status);
        });
    })->create();
