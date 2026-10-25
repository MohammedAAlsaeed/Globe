<?php

namespace Tests;

use App\Enums\SubscriptionStatus;
use App\Models\Plan;
use App\Models\User;
use App\Services\Totp;
use Database\Seeders\PlanSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\Storage;

abstract class TestCase extends BaseTestCase
{
    use RefreshDatabase;

    /** Requests from the web app's origin get Sanctum's session cookies. */
    protected const SPA_ORIGIN = 'http://localhost:3000';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PlanSeeder::class);
        // Tests always store files on a fake 's3' disk, whatever disk the
        // local .env uses for development.
        config(['regions.regions.global.disk' => 's3']);
        Storage::fake('s3');
        $this->withHeaders(['Origin' => self::SPA_ORIGIN, 'Referer' => self::SPA_ORIGIN.'/', 'Accept' => 'application/json']);
    }

    /**
     * Signs in as a staff member who has set up two-factor sign-in and
     * passed the code check just now (as the admin panel requires).
     */
    protected function asStaff(User $user): static
    {
        if (! $user->hasTwoFactor()) {
            $user->forceFill([
                'two_factor_secret' => app(Totp::class)->newSecret(),
                'two_factor_recovery_codes' => [],
                'two_factor_confirmed_at' => now(),
            ])->save();
        }

        return $this->actingAs($user)->withSession(['admin_2fa_at' => time(), 'session_version' => (int) $user->session_version]);
    }

    protected function onPlan(User $user, string $code): User
    {
        $user->subscriptions()->create([
            'plan_id' => Plan::query()->where('code', $code)->value('id'),
            'status' => SubscriptionStatus::Active,
            'provider' => 'manual',
            'starts_at' => now()->subMinute(),
        ]);

        return $user;
    }

    /** A small but realistic map document, as the editor saves it. */
    protected function document(array $extra = []): array
    {
        return [
            'id' => 'local-id',
            'name' => 'Test map',
            'layers' => [
                ['id' => 'l1', 'name' => 'Land', 'role' => 'land', 'visible' => true, 'locked' => false, 'opacity' => 1, 'objects' => []],
            ],
        ] + $extra;
    }
}
