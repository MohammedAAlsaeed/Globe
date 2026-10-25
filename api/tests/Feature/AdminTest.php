<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\AuditLog;
use App\Models\Map;
use App\Models\Plan;
use App\Models\User;
use App\Services\Totp;
use Database\Seeders\PlanSeeder;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Support\Facades\Notification;
use LogicException;
use Tests\TestCase;

class AdminTest extends TestCase
{
    private function staff(Role $role = Role::Admin): User
    {
        $user = User::factory()->create();
        $user->forceFill(['role' => $role])->save();

        return $user;
    }

    private function doc(): array
    {
        return ['id' => 'x', 'name' => 'World', 'layers' => []];
    }

    public function test_the_panel_is_for_staff_only(): void
    {
        $this->actingAs(User::factory()->create())->getJson('/api/v1/admin/session')
            ->assertForbidden()->assertJsonPath('code', 'not_staff');
        $this->getJson('/api/v1/admin/users')->assertForbidden()->assertJsonPath('code', 'not_staff');
    }

    public function test_api_tokens_never_open_the_panel(): void
    {
        $admin = $this->staff();
        $token = $admin->createToken('cli')->plainTextToken;
        $this->withHeaders(['Origin' => '', 'Referer' => '', 'Authorization' => "Bearer {$token}"])
            ->getJson('/api/v1/admin/session')->assertForbidden()->assertJsonPath('code', 'session_required');
    }

    public function test_two_factor_setup_and_verification(): void
    {
        $admin = $this->staff();
        $totp = app(Totp::class);

        $this->actingAs($admin)->getJson('/api/v1/admin/users')
            ->assertForbidden()->assertJsonPath('code', 'two_factor_setup_required');
        $this->getJson('/api/v1/admin/session')->assertOk()
            ->assertJsonPath('data.two_factor.enabled', false)
            ->assertJsonPath('data.permissions', Role::Admin->permissions());

        $secret = $this->postJson('/api/v1/admin/two-factor/setup')->assertOk()
            ->assertJsonPath('data.uri', fn ($uri) => str_starts_with($uri, 'otpauth://totp/'))->json('data.secret');
        $this->postJson('/api/v1/admin/two-factor/confirm', ['code' => '000000'])
            ->assertUnprocessable()->assertJsonPath('code', 'invalid_code');
        $codes = $this->postJson('/api/v1/admin/two-factor/confirm', ['code' => $totp->code($secret, time())])
            ->assertOk()->assertJsonCount(8, 'data.recovery_codes')->json('data.recovery_codes');
        $this->assertTrue($admin->fresh()->hasTwoFactor());
        // The secret is stored encrypted, and never sent again.
        $this->assertNotSame($secret, \DB::table('users')->where('id', $admin->id)->value('two_factor_secret'));
        $this->getJson('/api/v1/admin/session')->assertJsonMissingPath('data.secret');
        $this->getJson('/api/v1/admin/users')->assertOk();

        // Locked: the next visit asks for a code; a used code can't be replayed.
        $this->postJson('/api/v1/admin/two-factor/lock')->assertNoContent();
        $this->getJson('/api/v1/admin/users')->assertForbidden()->assertJsonPath('code', 'two_factor_required');
        $this->postJson('/api/v1/admin/two-factor/verify', ['code' => $totp->code($secret, time())])
            ->assertUnprocessable()->assertJsonPath('code', 'invalid_code');
        $this->postJson('/api/v1/admin/two-factor/verify', ['code' => $totp->code($secret, time() + 30)])->assertNoContent();
        $this->getJson('/api/v1/admin/users')->assertOk();

        // A recovery code works once.
        $this->postJson('/api/v1/admin/two-factor/lock');
        $this->postJson('/api/v1/admin/two-factor/verify', ['recovery_code' => $codes[0]])->assertNoContent();
        $this->postJson('/api/v1/admin/two-factor/lock');
        $this->postJson('/api/v1/admin/two-factor/verify', ['recovery_code' => $codes[0]])->assertUnprocessable();
        $this->assertSame(7, count($admin->fresh()->two_factor_recovery_codes));

        $this->assertTrue(AuditLog::query()->where('action', 'two_factor.enabled')->exists());
        $this->assertTrue(AuditLog::query()->where('action', 'two_factor.failed')->exists());
    }

    public function test_wrong_codes_pause_further_tries(): void
    {
        $admin = $this->staff();
        $this->asStaff($admin)->postJson('/api/v1/admin/two-factor/lock');
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/admin/two-factor/verify', ['code' => '000000'])->assertUnprocessable();
        }
        $secret = $admin->fresh()->two_factor_secret;
        $this->postJson('/api/v1/admin/two-factor/verify', ['code' => app(Totp::class)->code($secret, time())])
            ->assertStatus(429)->assertJsonPath('code', 'too_many_attempts');
    }

    public function test_the_session_check_expires(): void
    {
        $admin = $this->staff();
        $this->asStaff($admin)->getJson('/api/v1/admin/users')->assertOk();
        $this->withSession(['admin_2fa_at' => time() - 13 * 3600])
            ->getJson('/api/v1/admin/users')->assertForbidden()->assertJsonPath('code', 'two_factor_required');
    }

    public function test_permissions_follow_the_role(): void
    {
        $user = User::factory()->create();
        $support = $this->staff(Role::Support);
        $this->asStaff($support)->getJson('/api/v1/admin/users')->assertOk();
        $this->postJson("/api/v1/admin/users/{$user->id}/suspend", ['reason' => 'Spam'])
            ->assertForbidden()->assertJsonPath('code', 'forbidden');
        $this->getJson('/api/v1/admin/audit-log')->assertForbidden();
        $this->postJson("/api/v1/admin/users/{$user->id}/subscriptions", ['plan' => 'cartographer', 'days' => 30, 'note' => 'Support gift'])
            ->assertCreated();

        $editor = $this->staff(Role::Editor);
        $this->asStaff($editor)->getJson('/api/v1/admin/users')->assertForbidden();
        $this->getJson('/api/v1/admin/stats')->assertOk();
    }

    public function test_users_list_filters_and_detail(): void
    {
        $admin = $this->staff();
        $a = User::factory()->create(['name' => 'Ibn Battuta', 'email' => 'ibn@example.com']);
        $b = $this->onPlan(User::factory()->create(['email' => 'paid@example.com']), 'atlas');
        $b->forceFill(['suspended_at' => now(), 'suspended_reason' => 'x'])->save();

        $this->asStaff($admin)->getJson('/api/v1/admin/users?q=battuta')->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.email', 'ibn@example.com')->assertJsonPath('data.0.plan', 'explorer');
        $this->getJson('/api/v1/admin/users?plan=atlas')->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $b->id);
        $this->getJson('/api/v1/admin/users?plan=explorer')->assertJsonMissing(['id' => $b->id])->assertJsonFragment(['id' => $a->id]);
        $this->getJson('/api/v1/admin/users?status=suspended')->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/admin/users?role=staff')->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $admin->id);
        $this->getJson("/api/v1/admin/users/{$b->id}")->assertOk()
            ->assertJsonPath('data.plan.code', 'atlas')->assertJsonPath('data.suspended', true)
            ->assertJsonPath('data.subscriptions.0.plan.code', 'atlas')
            ->assertJsonMissingPath('data.two_factor_secret');
    }

    public function test_profile_edits_and_password_links_are_audited(): void
    {
        Notification::fake();
        $admin = $this->staff();
        $user = User::factory()->create(['email' => 'old@example.com']);

        $this->asStaff($admin)->patchJson("/api/v1/admin/users/{$user->id}", ['email' => 'new@example.com'])
            ->assertOk()->assertJsonPath('data.email', 'new@example.com')->assertJsonPath('data.email_verified', false);
        $this->postJson("/api/v1/admin/users/{$user->id}/password-reset")->assertNoContent();
        Notification::assertSentTo($user->fresh(), ResetPassword::class);

        $log = AuditLog::query()->where('action', 'user.updated')->firstOrFail();
        $this->assertSame($admin->id, $log->actor_id);
        $this->assertSame(['email' => 'old@example.com'], array_intersect_key($log->changes['before'], ['email' => 1]));
        $this->assertSame('new@example.com', $log->changes['after']['email']);
    }

    public function test_suspension_signs_the_person_out_and_blocks_sign_in(): void
    {
        $admin = $this->staff();
        $user = User::factory()->create(['email' => 'u@example.com']);
        $token = $user->createToken('t')->plainTextToken;

        $this->asStaff($admin)->postJson("/api/v1/admin/users/{$user->id}/suspend", ['reason' => 'Abuse reports'])
            ->assertOk()->assertJsonPath('data.suspended', true);
        $this->assertSame(0, $user->tokens()->count());

        $this->app['auth']->forgetGuards();
        $this->app['auth']->shouldUse('web');
        $this->flushSession();
        $this->postJson('/api/v1/auth/login', ['email' => 'u@example.com', 'password' => 'password1'])
            ->assertForbidden()->assertJsonPath('code', 'account_suspended')->assertJsonPath('reason', 'Abuse reports');
        $this->assertGuest('web');

        $this->asStaff($admin)->postJson("/api/v1/admin/users/{$user->id}/unsuspend")->assertOk()->assertJsonPath('data.suspended', false);
        $this->assertSame(2, AuditLog::query()->whereIn('action', ['user.suspended', 'user.unsuspended'])->count());
    }

    public function test_a_suspended_session_is_ended_on_its_next_request(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->getJson('/api/v1/auth/me')->assertOk();
        $user->forceFill(['suspended_at' => now(), 'suspended_reason' => 'x'])->save();
        $this->getJson('/api/v1/auth/me')->assertForbidden()->assertJsonPath('code', 'account_suspended');
    }

    public function test_ending_sessions_bumps_the_session_version(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->getJson('/api/v1/auth/me')->assertOk();
        $user->forceFill(['session_version' => $user->session_version + 1])->save();
        $this->getJson('/api/v1/auth/me')->assertUnauthorized()->assertJsonPath('code', 'session_ended');
    }

    public function test_staff_are_protected_and_nobody_acts_on_themselves(): void
    {
        $admin = $this->staff();
        $other = $this->staff(Role::Editor);
        $this->asStaff($admin)->postJson("/api/v1/admin/users/{$other->id}/suspend", ['reason' => 'Nope'])
            ->assertForbidden()->assertJsonPath('code', 'staff_protected');
        $this->postJson("/api/v1/admin/users/{$admin->id}/suspend", ['reason' => 'Nope'])
            ->assertUnprocessable()->assertJsonPath('code', 'not_on_yourself');
        $this->putJson("/api/v1/admin/users/{$other->id}/role", ['role' => 'admin'])->assertForbidden();
    }

    public function test_the_owner_changes_roles_with_a_fresh_code(): void
    {
        $owner = $this->staff(Role::Owner);
        $user = User::factory()->create();

        $this->asStaff($owner)->withSession(['admin_2fa_at' => time() - 3600])
            ->putJson("/api/v1/admin/users/{$user->id}/role", ['role' => 'editor'])
            ->assertForbidden()->assertJsonPath('code', 'step_up_required');
        $this->withSession(['admin_2fa_at' => time()])
            ->putJson("/api/v1/admin/users/{$user->id}/role", ['role' => 'editor'])->assertOk()->assertJsonPath('data.role', 'editor');
        $this->assertSame(Role::Editor, $user->fresh()->role);
        $this->assertSame(1, $user->fresh()->session_version);
        $this->putJson("/api/v1/admin/users/{$owner->id}/role", ['role' => 'admin'])->assertJsonPath('code', 'not_on_yourself');

        $log = AuditLog::query()->where('action', 'user.role_changed')->firstOrFail();
        $this->assertSame(['role' => 'user'], $log->changes['before']);
        $this->assertSame(['role' => 'editor'], $log->changes['after']);
    }

    public function test_deleting_an_account_needs_its_email_typed_and_removes_everything(): void
    {
        $owner = $this->staff(Role::Owner);
        $user = User::factory()->create(['email' => 'gone@example.com']);
        $this->actingAs($user)->postJson('/api/v1/maps', ['name' => 'World', 'width' => 1024, 'height' => 768, 'document' => $this->doc()])->assertCreated();
        $this->assertNotEmpty(\Storage::disk('s3')->allFiles('maps'));

        $this->asStaff($owner)->deleteJson("/api/v1/admin/users/{$user->id}", ['confirm' => 'wrong@example.com'])->assertUnprocessable();
        $this->deleteJson("/api/v1/admin/users/{$user->id}", ['confirm' => 'gone@example.com'])->assertNoContent();
        $this->assertNull(User::query()->find($user->id));
        $this->assertSame(0, Map::withTrashed()->count());
        $this->assertSame([], \Storage::disk('s3')->allFiles('maps'));
        $log = AuditLog::query()->where('action', 'user.deleted')->firstOrFail();
        $this->assertSame('gone@example.com', $log->target_label);
    }

    public function test_granting_extending_and_revoking_plans(): void
    {
        $admin = $this->staff();
        $user = User::factory()->create();

        $this->asStaff($admin)->postJson("/api/v1/admin/users/{$user->id}/subscriptions", ['plan' => 'explorer', 'note' => 'x'])
            ->assertUnprocessable();
        $sub = $this->postJson("/api/v1/admin/users/{$user->id}/subscriptions", ['plan' => 'cartographer', 'days' => 30, 'note' => 'Contest prize'])
            ->assertCreated()->assertJsonPath('data.granted_by.id', $admin->id)->assertJsonPath('data.current', true)->json('data');
        $this->actingAs($user)->getJson('/api/v1/auth/me')->assertJsonPath('data.plan.code', 'cartographer');

        // A new grant replaces the previous one.
        $atlas = $this->asStaff($admin)->postJson("/api/v1/admin/users/{$user->id}/subscriptions", ['plan' => 'atlas', 'note' => 'Partner'])
            ->assertCreated()->assertJsonPath('data.ends_at', null)->json('data');
        $this->assertSame(1, $user->subscriptions()->current()->count());

        $until = now()->addDays(90)->startOfSecond()->toAtomString();
        $this->patchJson("/api/v1/admin/subscriptions/{$atlas['id']}", ['ends_at' => $until])->assertOk()
            ->assertJsonPath('data.ends_at', fn ($v) => strtotime($v) === strtotime($until));
        $this->postJson("/api/v1/admin/subscriptions/{$atlas['id']}/revoke", ['reason' => 'Partnership ended'])->assertOk()->assertJsonPath('data.current', false);
        $this->postJson("/api/v1/admin/subscriptions/{$sub['id']}/revoke", ['reason' => 'again'])->assertStatus(409)->assertJsonPath('code', 'subscription_ended');
        $this->actingAs($user)->getJson('/api/v1/auth/me')->assertJsonPath('data.plan.code', 'explorer');

        $this->asStaff($admin)->getJson('/api/v1/admin/subscriptions?state=current')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson("/api/v1/admin/subscriptions?user={$user->id}")->assertJsonCount(2, 'data');
        $this->assertSame(['subscription.granted', 'subscription.granted', 'subscription.updated', 'subscription.revoked'],
            AuditLog::query()->where('action', 'like', 'subscription.%')->orderBy('id')->pluck('action')->all());
    }

    public function test_a_gift_never_lowers_a_paid_plan_and_paid_subscriptions_are_read_only(): void
    {
        $admin = $this->staff();
        $user = User::factory()->create();
        $paid = $user->subscriptions()->create([
            'plan_id' => Plan::query()->where('code', 'atlas')->value('id'),
            'status' => 'active', 'provider' => 'stripe', 'starts_at' => now()->subDay(),
        ]);
        $this->asStaff($admin)->postJson("/api/v1/admin/users/{$user->id}/subscriptions", ['plan' => 'cartographer', 'days' => 7, 'note' => 'Oops'])->assertCreated();
        $this->getJson("/api/v1/admin/users/{$user->id}")->assertJsonPath('data.plan.code', 'atlas');
        $this->patchJson("/api/v1/admin/subscriptions/{$paid->id}", ['ends_at' => null])->assertStatus(409)->assertJsonPath('code', 'provider_managed');
    }

    public function test_plans_are_tuned_by_the_owner_and_kept_by_the_seeder(): void
    {
        $this->asStaff($this->staff())->patchJson('/api/v1/admin/plans/explorer', ['max_maps' => 5])->assertForbidden();

        $this->asStaff($this->staff(Role::Owner))->getJson('/api/v1/admin/plans')->assertOk()->assertJsonCount(3, 'data');
        $this->patchJson('/api/v1/admin/plans/explorer', ['max_maps' => 5, 'code' => 'hacked'])->assertOk()
            ->assertJsonPath('data.max_maps', 5)->assertJsonPath('data.code', 'explorer');
        $this->seed(PlanSeeder::class);
        $this->assertSame(5, Plan::default()->max_maps);
        $this->getJson('/api/v1/plans')->assertJsonPath('data.0.max_maps', 5);
    }

    public function test_maps_moderation_and_audited_reading(): void
    {
        $owner = $this->staff(Role::Owner);
        $admin = $this->staff();
        $user = User::factory()->create();
        $id = $this->actingAs($user)->postJson('/api/v1/maps', ['name' => 'Secret world', 'width' => 1024, 'height' => 768, 'document' => $this->doc()])
            ->assertCreated()->json('data.id');

        $this->asStaff($admin)->getJson('/api/v1/admin/maps?q=secret')->assertOk()->assertJsonPath('data.0.id', $id)
            ->assertJsonMissingPath('data.0.document');
        // Admins can't open documents; that's the owner's (audited) permission.
        $this->postJson("/api/v1/admin/maps/{$id}/document", ['reason' => 'Bug report'])->assertForbidden();
        $this->deleteJson("/api/v1/admin/maps/{$id}", ['reason' => 'Reported content'])->assertNoContent();
        $this->assertSoftDeleted('maps', ['id' => $id]);
        $this->getJson('/api/v1/admin/maps?state=trashed')->assertJsonCount(1, 'data');
        $this->postJson("/api/v1/admin/maps/{$id}/restore")->assertNoContent();

        $this->asStaff($owner)->postJson("/api/v1/admin/maps/{$id}/document", [])->assertUnprocessable();
        $this->postJson("/api/v1/admin/maps/{$id}/document", ['reason' => 'Ticket 42'])->assertOk()->assertJsonPath('name', 'World');
        $log = AuditLog::query()->where('action', 'map.document_read')->firstOrFail();
        $this->assertSame('Ticket 42', $log->meta['reason']);
        $this->assertSame($owner->id, $log->actor_id);
    }

    public function test_stats_and_audit_log(): void
    {
        $owner = $this->staff(Role::Owner);
        $this->onPlan(User::factory()->count(2)->create()->first(), 'atlas');
        $this->asStaff($owner)->getJson('/api/v1/admin/stats?days=7')->assertOk()
            ->assertJsonPath('data.totals.users', 3)->assertJsonPath('data.totals.paid', 1)
            ->assertJsonCount(7, 'data.series.users')
            ->assertJsonPath('data.plans.2.users', 1);

        $this->postJson('/api/v1/admin/two-factor/lock');
        $this->withSession(['admin_2fa_at' => time()])->getJson('/api/v1/admin/audit-log?action=user.')->assertOk();
    }

    public function test_the_audit_log_is_append_only(): void
    {
        $owner = $this->staff(Role::Owner);
        $this->asStaff($owner)->postJson('/api/v1/admin/two-factor/recovery-codes')->assertOk();
        $log = AuditLog::query()->firstOrFail();
        $this->expectException(LogicException::class);
        $log->update(['action' => 'nothing.happened']);
    }

    public function test_official_content_needs_a_two_factor_staff_session_and_is_audited(): void
    {
        $editor = $this->staff(Role::Editor);
        $look = LineStyleTest::look();
        $this->actingAs($editor)->postJson('/api/v1/line-styles', ['name' => 'Royal road', 'look' => $look, 'official' => true])
            ->assertForbidden()->assertJsonPath('code', 'two_factor_setup_required');

        $id = $this->asStaff($editor)->postJson('/api/v1/line-styles', ['name' => 'Royal road', 'look' => $look, 'official' => true])
            ->assertCreated()->json('data.id');
        $this->patchJson("/api/v1/line-styles/{$id}", ['published' => true])->assertOk();
        $this->assertSame(['content.line_style.created', 'content.line_style.updated'],
            AuditLog::query()->where('action', 'like', 'content.%')->orderBy('id')->pluck('action')->all());
        // People's own styles are theirs: not audited.
        $this->actingAs(User::factory()->create())->postJson('/api/v1/line-styles', ['name' => 'Mine', 'look' => $look])->assertCreated();
        $this->assertSame(2, AuditLog::query()->count());
    }

    public function test_make_admin_command_roles_and_two_factor_reset(): void
    {
        $user = User::factory()->create(['email' => 'boss@example.com']);
        $this->artisan('idrisi:make-admin', ['email' => 'boss@example.com', '--role' => 'owner'])->assertSuccessful();
        $this->assertSame(Role::Owner, $user->fresh()->role);
        $user->forceFill(['two_factor_secret' => 'X', 'two_factor_confirmed_at' => now()])->save();
        $this->artisan('idrisi:make-admin', ['email' => 'boss@example.com', '--reset-two-factor' => true])->assertSuccessful();
        $this->assertFalse($user->fresh()->hasTwoFactor());
        $this->assertSame(Role::Owner, $user->fresh()->role);
        $this->artisan('idrisi:make-admin', ['email' => 'boss@example.com', '--role' => 'king'])->assertFailed();
        $this->assertTrue(AuditLog::query()->where('action', 'user.role_changed')->whereNull('actor_id')->exists());
    }
}
