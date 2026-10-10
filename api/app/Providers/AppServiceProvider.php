<?php

namespace App\Providers;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // Catch N+1 queries and silently dropped attributes while developing.
        Model::preventLazyLoading(! $this->app->isProduction());
        Model::preventSilentlyDiscardingAttributes(! $this->app->isProduction());

        Gate::define('admin', fn (User $user) => $user->isAdmin());

        Password::defaults(fn () => Password::min(8)->letters()->numbers());

        // Password-reset emails link to the web app, which posts the new
        // password back to /api/v1/auth/reset-password.
        ResetPassword::createUrlUsing(fn (User $user, string $token) => config('idrisi.frontend_url')
            .'/reset-password?token='.$token.'&email='.urlencode($user->getEmailForPasswordReset()));

        $this->configureRateLimits();
    }

    private function configureRateLimits(): void
    {
        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(120)->by($request->user()?->id ?: $request->ip()));
        RateLimiter::for('uploads', fn (Request $request) => Limit::perMinute(30)->by($request->user()?->id ?: $request->ip()));
        RateLimiter::for('login', fn (Request $request) => [
            Limit::perMinute(5)->by(strtolower((string) $request->input('email')).'|'.$request->ip()),
            Limit::perMinute(30)->by($request->ip()),
        ]);
        RateLimiter::for('register', fn (Request $request) => Limit::perHour(10)->by($request->ip()));
    }
}
