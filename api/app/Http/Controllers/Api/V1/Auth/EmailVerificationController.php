<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Auth\Events\Verified;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Email verification. The emailed link is a signed URL to this API; it
 * verifies the address and sends the browser on to the web app — whether or
 * not that browser is signed in.
 */
class EmailVerificationController extends Controller
{
    public function send(Request $request): Response
    {
        if (! $request->user()->hasVerifiedEmail()) {
            $request->user()->sendEmailVerificationNotification();
        }

        return response()->noContent();
    }

    public function verify(string $id, string $hash): RedirectResponse
    {
        $user = User::findOrFail($id);
        abort_unless(hash_equals(sha1($user->getEmailForVerification()), $hash), 403);
        if ($user->markEmailAsVerified()) {
            event(new Verified($user));
        }

        return redirect()->away(config('idrisi.frontend_url').'/?verified=1');
    }
}
