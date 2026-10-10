<?php

namespace Tests\Feature;

use App\Models\User;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\User as SocialiteUser;
use Mockery;
use Tests\TestCase;

class GoogleLoginTest extends TestCase
{
    private function fakeGoogle(string $id, string $email, bool $verified = true): void
    {
        $google = (new SocialiteUser)->setRaw(['email_verified' => $verified])->map([
            'id' => $id, 'name' => 'Google Person', 'email' => $email, 'avatar' => 'https://example.com/a.png',
        ]);
        $driver = Mockery::mock();
        $driver->shouldReceive('user')->andReturn($google);
        Socialite::shouldReceive('driver')->with('google')->andReturn($driver);
    }

    public function test_new_google_user_gets_a_verified_account(): void
    {
        $this->fakeGoogle('g-1', 'New@Example.com');

        $this->get('/auth/google/callback')->assertRedirect('http://localhost:3000/auth/callback');

        $user = User::query()->where('email', 'new@example.com')->firstOrFail();
        $this->assertTrue($user->hasVerifiedEmail());
        $this->assertNull($user->password);
        $this->assertAuthenticatedAs($user);
        $this->assertDatabaseHas('social_accounts', ['user_id' => $user->id, 'provider' => 'google', 'provider_id' => 'g-1']);
    }

    public function test_google_links_to_an_existing_account_with_the_same_email(): void
    {
        $existing = User::factory()->create(['email' => 'mo@example.com']);
        $this->fakeGoogle('g-2', 'mo@example.com');

        $this->get('/auth/google/callback')->assertRedirect('http://localhost:3000/auth/callback');

        $this->assertSame(1, User::count());
        $this->assertAuthenticatedAs($existing);
        // Next time, the link is used directly.
        auth()->logout();
        $this->get('/auth/google/callback');
        $this->assertSame(1, User::count());
        $this->assertDatabaseCount('social_accounts', 1);
    }

    public function test_unverified_google_email_is_refused(): void
    {
        $this->fakeGoogle('g-3', 'x@example.com', verified: false);
        $this->get('/auth/google/callback')->assertRedirect('http://localhost:3000/login?error=google_email');
        $this->assertGuest();
    }
}
