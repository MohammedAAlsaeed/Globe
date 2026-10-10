<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\Regions;
use Illuminate\Auth\Events\Registered;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

/**
 * Email + password accounts for the web app (Sanctum SPA): the session lives
 * in an HttpOnly cookie. The app first calls GET /sanctum/csrf-cookie, then
 * sends the XSRF-TOKEN cookie back as the X-XSRF-TOKEN header.
 */
class SessionController extends Controller
{
    public function register(Request $request, Regions $regions): UserResource
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'email' => ['required', 'string', 'lowercase', 'email', 'max:254', Rule::unique(User::class)],
            'password' => ['required', 'confirmed', Password::defaults()],
            'locale' => ['sometimes', Rule::in(config('idrisi.locales'))],
            'region' => ['sometimes', 'string', 'max:16'],
        ]);

        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => $data['password'],
            'locale' => $data['locale'] ?? config('app.locale'),
            'region' => $regions->resolve($data['region'] ?? null),
        ]);
        event(new Registered($user)); // sends the verification email

        Auth::login($user);
        $request->session()->regenerate();

        return new UserResource($user);
    }

    public function login(Request $request): UserResource
    {
        $credentials = $request->validate([
            'email' => ['required', 'string', 'email'],
            'password' => ['required', 'string'],
        ]);

        if (! Auth::attempt($credentials, $request->boolean('remember'))) {
            throw ValidationException::withMessages(['email' => __('auth.failed')]);
        }
        $request->session()->regenerate();

        return new UserResource($request->user());
    }

    public function logout(Request $request): Response
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }

    public function me(Request $request): UserResource
    {
        return new UserResource($request->user());
    }

    /** Profile settings the user can change themselves. */
    public function update(Request $request): UserResource
    {
        $user = $request->user();
        $user->update($request->validate([
            'name' => ['sometimes', 'string', 'max:80'],
            'locale' => ['sometimes', Rule::in(config('idrisi.locales'))],
        ]));

        return new UserResource($user);
    }
}
