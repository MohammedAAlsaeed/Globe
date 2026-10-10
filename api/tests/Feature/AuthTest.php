<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class AuthTest extends TestCase
{
    public function test_register_signs_in_on_the_free_plan_and_sends_verification(): void
    {
        Notification::fake();

        $this->postJson('/api/v1/auth/register', [
            'name' => 'Mohammed',
            'email' => 'mo@example.com',
            'password' => 'secret123',
            'password_confirmation' => 'secret123',
            'locale' => 'ar',
        ])
            ->assertCreated()
            ->assertJsonPath('data.email', 'mo@example.com')
            ->assertJsonPath('data.role', 'user')
            ->assertJsonPath('data.email_verified', false)
            ->assertJsonPath('data.plan.code', 'explorer')
            ->assertJsonPath('data.plan.max_maps', 3)
            ->assertJsonPath('data.usage.maps', 0);

        $this->assertAuthenticated();
        Notification::assertSentTo(User::first(), VerifyEmail::class);
    }

    public function test_register_rejects_weak_passwords_and_duplicate_emails(): void
    {
        User::factory()->create(['email' => 'taken@example.com']);

        $this->postJson('/api/v1/auth/register', [
            'name' => 'X', 'email' => 'taken@example.com', 'password' => 'short', 'password_confirmation' => 'short',
        ])->assertUnprocessable()->assertJsonValidationErrors(['email', 'password']);
    }

    public function test_login_logout_and_me(): void
    {
        $user = User::factory()->create(['email' => 'a@example.com']);

        $this->postJson('/api/v1/auth/login', ['email' => 'a@example.com', 'password' => 'wrong-pass1'])
            ->assertUnprocessable()->assertJsonValidationErrors('email');
        $this->assertGuest();

        $this->postJson('/api/v1/auth/login', ['email' => 'a@example.com', 'password' => 'password1'])
            ->assertOk()->assertJsonPath('data.id', $user->id);
        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.email', 'a@example.com');

        $this->postJson('/api/v1/auth/logout')->assertNoContent();
        $this->assertGuest('web');
    }

    public function test_protected_routes_answer_401_json_to_guests(): void
    {
        $this->getJson('/api/v1/auth/me')->assertUnauthorized();
        $this->getJson('/api/v1/maps')->assertUnauthorized();
    }

    public function test_login_is_rate_limited(): void
    {
        User::factory()->create(['email' => 'a@example.com']);
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/auth/login', ['email' => 'a@example.com', 'password' => 'nope-nope1']);
        }
        $this->postJson('/api/v1/auth/login', ['email' => 'a@example.com', 'password' => 'password1'])
            ->assertTooManyRequests();
    }

    public function test_profile_update(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->patchJson('/api/v1/auth/me', ['name' => 'New', 'locale' => 'en'])
            ->assertOk()->assertJsonPath('data.name', 'New')->assertJsonPath('data.locale', 'en');
        $this->actingAs($user)->patchJson('/api/v1/auth/me', ['locale' => 'xx'])->assertUnprocessable();
    }

    public function test_password_reset_link_points_to_the_web_app(): void
    {
        Notification::fake();
        $user = User::factory()->create();

        $this->postJson('/api/v1/auth/forgot-password', ['email' => $user->email])->assertOk();
        // Unknown emails get the same answer (no account probing).
        $this->postJson('/api/v1/auth/forgot-password', ['email' => 'nobody@example.com'])->assertOk();

        Notification::assertSentTo($user, ResetPassword::class, function (ResetPassword $n) use ($user) {
            $url = $n->toMail($user)->actionUrl;
            $this->assertStringStartsWith('http://localhost:3000/reset-password?token=', $url);

            $this->postJson('/api/v1/auth/reset-password', [
                'token' => $n->token, 'email' => $user->email,
                'password' => 'brandnew1', 'password_confirmation' => 'brandnew1',
            ])->assertOk();

            return true;
        });
        $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'brandnew1'])->assertOk();
    }

    public function test_email_verification_link_verifies_and_redirects_to_the_web_app(): void
    {
        $user = User::factory()->unverified()->create();
        $url = URL::temporarySignedRoute('verification.verify', now()->addHour(), [
            'id' => $user->id, 'hash' => sha1($user->email),
        ]);

        $this->get($url)->assertRedirect('http://localhost:3000/?verified=1');
        $this->assertTrue($user->fresh()->hasVerifiedEmail());

        // A tampered link is refused.
        $other = User::factory()->unverified()->create();
        $bad = str_replace($user->id, $other->id, $url);
        $this->get($bad)->assertForbidden();
    }
}
