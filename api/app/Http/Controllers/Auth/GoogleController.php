<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Api\V1\Auth\SessionController;
use App\Http\Controllers\Controller;
use App\Models\SocialAccount;
use App\Models\User;
use App\Services\Regions;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Laravel\Socialite\Contracts\User as SocialUser;
use Laravel\Socialite\Facades\Socialite;
use Symfony\Component\HttpFoundation\RedirectResponse as SymfonyRedirect;
use Throwable;

/**
 * "Continue with Google". Full-page redirects (web routes): the web app
 * links to /auth/google/redirect and gets the browser back, signed in, at
 * FRONTEND_URL/auth/callback.
 *
 * A Google account whose verified email matches an existing account is
 * linked to it, so the same person never ends up with two accounts.
 */
class GoogleController extends Controller
{
    public function redirect(): SymfonyRedirect
    {
        return Socialite::driver('google')->redirect();
    }

    public function callback(Request $request, Regions $regions): RedirectResponse
    {
        $frontend = config('idrisi.frontend_url');
        try {
            $google = Socialite::driver('google')->user();
        } catch (Throwable) {
            return redirect()->away($frontend.'/login?error=google');
        }
        if (! $google->getEmail() || ! ($google->getRaw()['email_verified'] ?? false)) {
            return redirect()->away($frontend.'/login?error=google_email');
        }

        $user = DB::transaction(fn () => $this->findOrCreateUser($google, $regions));
        if ($user->isSuspended()) {
            return redirect()->away($frontend.'/login?error=suspended');
        }

        Auth::login($user, remember: true);
        $request->session()->regenerate();
        SessionController::startSession($request, $user);

        return redirect()->away($frontend.'/auth/callback');
    }

    private function findOrCreateUser(SocialUser $google, Regions $regions): User
    {
        $account = SocialAccount::query()
            ->where('provider', 'google')
            ->where('provider_id', $google->getId())
            ->first();
        if ($account) {
            return $account->user;
        }

        $email = strtolower($google->getEmail());
        $user = User::query()->where('email', $email)->first()
            ?? User::create([
                'name' => $google->getName() ?: strtok($email, '@'),
                'email' => $email,
                'avatar_url' => $google->getAvatar(),
                'locale' => config('app.locale'),
                'region' => $regions->resolve(null),
            ]);
        if (! $user->hasVerifiedEmail()) {
            $user->markEmailAsVerified();
        }
        $user->socialAccounts()->create(['provider' => 'google', 'provider_id' => $google->getId()]);

        return $user;
    }
}
