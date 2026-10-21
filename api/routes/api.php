<?php

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
use App\Http\Controllers\Api\V1\TextStyleController;
use Illuminate\Support\Facades\Route;

/*
| API v1 — served under /api/v1 (see bootstrap/app.php). The web app signs
| in with Sanctum's cookie-based SPA sessions.
*/

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
});
