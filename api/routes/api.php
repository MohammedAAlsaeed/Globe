<?php

use App\Http\Controllers\Api\V1\Admin;
use App\Http\Controllers\Api\V1\AssetController;
use App\Http\Controllers\Api\V1\AssetPackController;
use App\Http\Controllers\Api\V1\Auth\EmailVerificationController;
use App\Http\Controllers\Api\V1\Auth\PasswordController;
use App\Http\Controllers\Api\V1\Auth\SessionController;
use App\Http\Controllers\Api\V1\LineStyleController;
use App\Http\Controllers\Api\V1\MapController;
use App\Http\Controllers\Api\V1\MapExportController;
use App\Http\Controllers\Api\V1\MapThumbnailController;
use App\Http\Controllers\Api\V1\PlanController;
use App\Http\Controllers\Api\V1\PreferencesController;
use App\Http\Controllers\Api\V1\ShapeStyleController;
use App\Http\Controllers\Api\V1\SystemController;
use App\Http\Controllers\Api\V1\TextStyleController;
use Illuminate\Support\Facades\Route;

/*
| API v1 — served under /api/v1 (see bootstrap/app.php). The web app signs
| in with Sanctum's cookie-based SPA sessions.
*/

// ---- the service ------------------------------------------------------------
// Up (200) or in maintenance (503 with code "maintenance", before reaching here).
Route::get('status', [SystemController::class, 'status']);
// Errors seen in visitors' browsers, written to the server's log.
Route::post('client-errors', [SystemController::class, 'clientError'])->middleware('throttle:client-errors');

// ---- accounts ---------------------------------------------------------------
Route::prefix('auth')->group(function () {
    Route::middleware('guest')->group(function () {
        Route::post('register', [SessionController::class, 'register'])->middleware('throttle:register');
        Route::post('login', [SessionController::class, 'login'])->middleware('throttle:login');
        Route::post('forgot-password', [PasswordController::class, 'forgot'])->middleware('throttle:login');
        Route::post('reset-password', [PasswordController::class, 'reset'])->middleware('throttle:login');
    });

    Route::get('verify-email/{id}/{hash}', [EmailVerificationController::class, 'verify'])
        ->middleware(['signed', 'throttle:6,1'])
        ->name('verification.verify');

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('me', [SessionController::class, 'me']);
        Route::patch('me', [SessionController::class, 'update']);
        Route::get('me/preferences', [PreferencesController::class, 'show']);
        Route::put('me/preferences', [PreferencesController::class, 'update'])->middleware('throttle:api');
        Route::post('logout', [SessionController::class, 'logout']);
        Route::post('email/verification-notification', [EmailVerificationController::class, 'send'])
            ->middleware('throttle:6,1');
    });
});

// ---- plans (public: compared wherever a limit is reached) -------------------
Route::get('plans', [PlanController::class, 'index'])->middleware('throttle:api');

// ---- maps & assets ------------------------------------------------------------
Route::middleware(['auth:sanctum', 'throttle:api'])->group(function () {
    Route::get('maps', [MapController::class, 'index']);
    Route::post('maps', [MapController::class, 'store']);
    Route::get('maps/{map}', [MapController::class, 'show']);
    Route::put('maps/{map}', [MapController::class, 'update']);
    Route::patch('maps/{map}', [MapController::class, 'rename']);
    Route::delete('maps/{map}', [MapController::class, 'destroy']);
    Route::post('maps/{map}/thumbnail', MapThumbnailController::class)->middleware('throttle:uploads');
    Route::post('maps/{map}/exports', [MapExportController::class, 'forMap']);
    Route::post('exports', [MapExportController::class, 'store']);

    Route::get('asset-packs', [AssetPackController::class, 'index']);
    Route::post('asset-packs', [AssetPackController::class, 'store']);
    Route::patch('asset-packs/{pack}', [AssetPackController::class, 'update']);
    Route::delete('asset-packs/{pack}', [AssetPackController::class, 'destroy']);
    Route::get('asset-packs/{pack}/assets', [AssetPackController::class, 'assets']);
    Route::post('asset-packs/{pack}/assets', [AssetController::class, 'store'])->middleware('throttle:uploads');
    Route::get('assets', [AssetController::class, 'index']);
    Route::patch('assets/{asset}', [AssetController::class, 'update']);
    Route::delete('assets/{asset}', [AssetController::class, 'destroy']);

    Route::get('line-styles', [LineStyleController::class, 'index']);
    Route::post('line-styles', [LineStyleController::class, 'store']);
    Route::patch('line-styles/{lineStyle}', [LineStyleController::class, 'update']);
    Route::delete('line-styles/{lineStyle}', [LineStyleController::class, 'destroy']);

    Route::get('text-styles', [TextStyleController::class, 'index']);
    Route::post('text-styles', [TextStyleController::class, 'store']);
    Route::patch('text-styles/{textStyle}', [TextStyleController::class, 'update']);
    Route::delete('text-styles/{textStyle}', [TextStyleController::class, 'destroy']);
    Route::get('shape-styles', [ShapeStyleController::class, 'index']);
    Route::post('shape-styles', [ShapeStyleController::class, 'store']);
    Route::patch('shape-styles/{shapeStyle}', [ShapeStyleController::class, 'update']);
    Route::delete('shape-styles/{shapeStyle}', [ShapeStyleController::class, 'destroy']);
});

// ---- admin panel ----------------------------------------------------------------
// Staff only. Every route checks a permission (never a role); the panel
// needs a two-factor code once per session, and sensitive changes a fresh
// one (`admin.2fa:recent`). Everything that changes data is audited.
Route::prefix('admin')->middleware(['auth:sanctum', 'staff', 'throttle:admin'])->group(function () {
    Route::get('session', [Admin\TwoFactorController::class, 'session']);
    Route::prefix('two-factor')->group(function () {
        // Wrong codes are also counted per person (see TwoFactorController).
        Route::middleware('throttle:two-factor')->group(function () {
            Route::post('setup', [Admin\TwoFactorController::class, 'setup']);
            Route::post('confirm', [Admin\TwoFactorController::class, 'confirm']);
            Route::post('verify', [Admin\TwoFactorController::class, 'verify']);
        });
        Route::post('lock', [Admin\TwoFactorController::class, 'lock']);
        Route::post('recovery-codes', [Admin\TwoFactorController::class, 'recoveryCodes'])->middleware('admin.2fa:recent');
    });

    Route::middleware('admin.2fa')->group(function () {
        Route::get('stats', Admin\StatsController::class)->middleware('permission:stats.view');

        Route::middleware('permission:users.view')->group(function () {
            Route::get('users', [Admin\UserController::class, 'index']);
            Route::get('users/{user}', [Admin\UserController::class, 'show']);
        });
        Route::middleware('permission:users.manage')->group(function () {
            Route::patch('users/{user}', [Admin\UserController::class, 'update']);
            Route::post('users/{user}/password-reset', [Admin\UserController::class, 'sendPasswordReset']);
            Route::post('users/{user}/end-sessions', [Admin\UserController::class, 'endSessions']);
        });
        Route::middleware('permission:users.suspend')->group(function () {
            Route::post('users/{user}/suspend', [Admin\UserController::class, 'suspend']);
            Route::post('users/{user}/unsuspend', [Admin\UserController::class, 'unsuspend']);
        });
        Route::middleware(['permission:staff.manage', 'admin.2fa:recent'])->group(function () {
            Route::put('users/{user}/role', [Admin\UserController::class, 'setRole']);
            Route::post('users/{user}/two-factor-reset', [Admin\UserController::class, 'resetTwoFactor']);
        });
        Route::delete('users/{user}', [Admin\UserController::class, 'destroy'])
            ->middleware(['permission:users.delete', 'admin.2fa:recent']);

        Route::get('subscriptions', [Admin\SubscriptionController::class, 'index'])->middleware('permission:subscriptions.view');
        Route::post('users/{user}/subscriptions', [Admin\SubscriptionController::class, 'store'])->middleware('permission:subscriptions.grant');
        Route::middleware('permission:subscriptions.manage')->group(function () {
            Route::patch('subscriptions/{subscription}', [Admin\SubscriptionController::class, 'update']);
            Route::post('subscriptions/{subscription}/revoke', [Admin\SubscriptionController::class, 'revoke']);
        });

        Route::get('plans', [Admin\PlanController::class, 'index'])->middleware('permission:plans.view');
        Route::patch('plans/{plan:code}', [Admin\PlanController::class, 'update'])->middleware(['permission:plans.manage', 'admin.2fa:recent']);

        Route::get('maps', [Admin\MapController::class, 'index'])->middleware('permission:maps.view');
        Route::middleware('permission:maps.manage')->group(function () {
            Route::delete('maps/{map}', [Admin\MapController::class, 'destroy']);
            Route::post('maps/{id}/restore', [Admin\MapController::class, 'restore']);
        });
        Route::post('maps/{id}/document', [Admin\MapController::class, 'document'])
            ->middleware(['permission:maps.read', 'admin.2fa:recent']);

        Route::get('audit-log', [Admin\AuditLogController::class, 'index'])->middleware('permission:audit.view');
    });
});
