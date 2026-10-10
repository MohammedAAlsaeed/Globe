<?php

use App\Http\Controllers\Auth\GoogleController;
use Illuminate\Support\Facades\Route;

// The web app lives elsewhere (FRONTEND_URL); this service is API-only.
Route::get('/', fn () => response()->json(['name' => config('app.name'), 'api' => '/api/v1']));

// "Continue with Google" — full-page redirects, so these are web routes.
Route::middleware('guest')->prefix('auth/google')->group(function () {
    Route::get('redirect', [GoogleController::class, 'redirect']);
    Route::get('callback', [GoogleController::class, 'callback']);
});
