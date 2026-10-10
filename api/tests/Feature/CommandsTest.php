<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Entitlements;
use Tests\TestCase;

class CommandsTest extends TestCase
{
    public function test_grant_plan_and_expiry(): void
    {
        $user = User::factory()->create(['email' => 'mo@example.com']);
        $this->artisan('idrisi:grant-plan', ['email' => 'mo@example.com', 'plan' => 'cartographer', '--days' => 30])->assertSuccessful();
        $this->assertSame('cartographer', app(Entitlements::class)->plan($user)->code);

        // After it ends, the free plan applies again.
        $this->travel(31)->days();
        $this->assertSame('explorer', (new Entitlements)->plan($user->fresh())->code);

        $this->artisan('idrisi:grant-plan', ['email' => 'nobody@example.com', 'plan' => 'atlas'])->assertFailed();
    }

    public function test_make_admin(): void
    {
        $user = User::factory()->create(['email' => 'mo@example.com']);
        $this->artisan('idrisi:make-admin', ['email' => 'mo@example.com'])->assertSuccessful();
        $this->assertTrue($user->fresh()->isAdmin());
        $this->artisan('idrisi:make-admin', ['email' => 'mo@example.com', '--revoke' => true])->assertSuccessful();
        $this->assertFalse($user->fresh()->isAdmin());
    }
}
