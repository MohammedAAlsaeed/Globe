<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\Asset;
use App\Models\AssetPack;
use App\Models\AuditLog;
use App\Models\LineStyle;
use App\Models\MapTemplate;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ContentManagementTest extends TestCase
{
    private function staff(Role $role = Role::Admin): User
    {
        $user = User::factory()->create();
        $user->forceFill(['role' => $role])->save();

        return $user;
    }

    /** A person with one uploaded stamp; returns [user, asset id]. */
    private function uploader(): array
    {
        $user = User::factory()->create();
        $pack = $this->actingAs($user)->postJson('/api/v1/asset-packs', ['name' => 'Mine', 'kind' => 'stamps'])
            ->assertCreated()->json('data');
        $id = $this->post("/api/v1/asset-packs/{$pack['id']}/assets", ['file' => UploadedFile::fake()->image('oak.png', 64, 64)])
            ->assertCreated()->json('data.id');

        return [$user, $id];
    }

    private function lineLook(): array
    {
        return LineStyleTest::look();
    }

    public function test_hidden_built_in_art_is_public_and_set_by_staff(): void
    {
        $this->getJson('/api/v1/content/controls')->assertOk()
            ->assertJsonPath('data.hidden.stamp_set', [])
            ->assertJsonPath('data.hidden.texture', []);

        // Not staff, and staff without the permission, can't change it.
        $this->actingAs(User::factory()->create())
            ->putJson('/api/v1/admin/content/controls', ['kind' => 'texture', 'keys' => ['lava'], 'hidden' => true])
            ->assertForbidden();
        $this->asStaff($this->staff(Role::Support))
            ->putJson('/api/v1/admin/content/controls', ['kind' => 'texture', 'keys' => ['lava'], 'hidden' => true])
            ->assertForbidden()->assertJsonPath('permission', 'content.manage');

        $this->asStaff($this->staff(Role::Editor))
            ->putJson('/api/v1/admin/content/controls', ['kind' => 'stamp_set', 'keys' => ['pine', 'castle'], 'hidden' => true])
            ->assertOk()->assertJsonPath('data.hidden.stamp_set', ['castle', 'pine']);
        $this->putJson('/api/v1/admin/content/controls', ['kind' => 'template', 'keys' => ['earth'], 'hidden' => true])->assertOk();
        // Hiding twice changes nothing; unknown kinds and odd keys are refused.
        $this->putJson('/api/v1/admin/content/controls', ['kind' => 'stamp_set', 'keys' => ['pine'], 'hidden' => true])
            ->assertOk()->assertJsonPath('data.hidden.stamp_set', ['castle', 'pine']);
        $this->putJson('/api/v1/admin/content/controls', ['kind' => 'fonts', 'keys' => ['amiri'], 'hidden' => true])->assertUnprocessable();
        $this->putJson('/api/v1/admin/content/controls', ['kind' => 'texture', 'keys' => ['a b'], 'hidden' => true])->assertUnprocessable();

        // Everyone's editor (signed out too) sees the change at once.
        $this->getJson('/api/v1/content/controls')->assertOk()
            ->assertJsonPath('data.hidden.stamp_set', ['castle', 'pine'])
            ->assertJsonPath('data.hidden.template', ['earth']);

        $this->putJson('/api/v1/admin/content/controls', ['kind' => 'stamp_set', 'keys' => ['pine'], 'hidden' => false])
            ->assertOk()->assertJsonPath('data.hidden.stamp_set', ['castle']);
        $this->assertTrue(AuditLog::query()->where('action', 'content.builtin.hidden')->exists());
        $this->assertTrue(AuditLog::query()->where('action', 'content.builtin.shown')->exists());
    }

    public function test_staff_review_and_trash_peoples_uploads(): void
    {
        [$user, $assetId] = $this->uploader();
        $path = Asset::query()->findOrFail($assetId)->path;

        // The official library alone is `content.manage`; people's uploads need `content.moderate`.
        $this->asStaff($this->staff(Role::Editor))
            ->getJson('/api/v1/admin/content/items?type=assets')
            ->assertForbidden()->assertJsonPath('permission', 'content.moderate');
        $this->getJson('/api/v1/admin/content/items?type=assets&scope=official')->assertOk()->assertJsonCount(0, 'data');
        $this->deleteJson("/api/v1/admin/content/items/assets/{$assetId}", ['reason' => 'Not appropriate'])->assertForbidden();

        $admin = $this->staff();
        $this->asStaff($admin)->getJson('/api/v1/admin/content/items?type=assets')
            ->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $assetId)
            ->assertJsonPath('data.0.owner.email', $user->email)
            ->assertJsonPath('data.0.kind', 'stamps')
            ->assertJsonPath('data.0.official', false);
        $this->getJson('/api/v1/admin/content/items?type=assets&q='.urlencode($user->email))->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/admin/content/items?type=assets&q=nobody')->assertJsonCount(0, 'data');

        // A person's upload is never removed without a reason.
        $this->deleteJson("/api/v1/admin/content/items/assets/{$assetId}")->assertUnprocessable();
        $this->deleteJson("/api/v1/admin/content/items/assets/{$assetId}", ['reason' => 'Not appropriate'])->assertNoContent();
        $this->assertSoftDeleted('assets', ['id' => $assetId, 'removed_by' => $admin->id]);
        Storage::disk('s3')->assertExists($path);
        $this->getJson('/api/v1/admin/content/items?type=assets')->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/admin/content/items?type=assets&state=trashed')
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.removed_reason', 'Not appropriate');
        $log = AuditLog::query()->where('action', 'content.trashed')->firstOrFail();
        $this->assertSame('Not appropriate', $log->meta['reason']);
        $this->assertSame($user->id, $log->meta['owner']);

        // Gone for its owner: not drawn in their maps, not counted in their uploads.
        $this->actingAs($user)->getJson("/api/v1/assets?ids[]={$assetId}")->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/asset-packs')->assertJsonPath('data.0.assets_count', 0);

        $this->asStaff($admin)->postJson("/api/v1/admin/content/items/assets/{$assetId}/restore")->assertNoContent();
        $this->assertDatabaseHas('assets', ['id' => $assetId, 'deleted_at' => null, 'removed_reason' => null]);
        $this->actingAs($user)->getJson("/api/v1/assets?ids[]={$assetId}")->assertJsonCount(1, 'data');
    }

    public function test_the_trash_is_emptied_after_thirty_days(): void
    {
        [$user, $assetId] = $this->uploader();
        $path = Asset::query()->findOrFail($assetId)->path;
        $styleId = $this->actingAs($user)->postJson('/api/v1/line-styles', ['name' => 'Road', 'look' => $this->lineLook()])
            ->assertCreated()->json('data.id');

        $this->asStaff($this->staff());
        $this->getJson('/api/v1/admin/content/items?type=line_styles')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.look.mode', 'color');
        $this->deleteJson("/api/v1/admin/content/items/assets/{$assetId}", ['reason' => 'Copied art'])->assertNoContent();
        $this->deleteJson("/api/v1/admin/content/items/line_styles/{$styleId}", ['reason' => 'Rude name'])->assertNoContent();
        $this->deleteJson('/api/v1/admin/content/items/fonts/x')->assertNotFound();

        // A trashed style no longer counts toward the person's limit.
        $this->actingAs($user)->getJson('/api/v1/line-styles')->assertJsonPath('limits.count', 0);

        $this->artisan('content:purge-trashed')->expectsOutputToContain('Purged 0 items')->assertSuccessful();
        Storage::disk('s3')->assertExists($path);

        $this->travel(31)->days();
        $this->artisan('content:purge-trashed')->expectsOutputToContain('Purged 2 items')->assertSuccessful();
        Storage::disk('s3')->assertMissing($path);
        $this->assertDatabaseMissing('assets', ['id' => $assetId]);
        $this->assertDatabaseMissing('line_styles', ['id' => $styleId]);
    }

    public function test_people_still_delete_their_own_things_for_good(): void
    {
        [$user, $assetId] = $this->uploader();
        $path = Asset::query()->findOrFail($assetId)->path;
        $styleId = $this->actingAs($user)->postJson('/api/v1/line-styles', ['name' => 'Road', 'look' => $this->lineLook()])->json('data.id');

        $this->deleteJson("/api/v1/assets/{$assetId}")->assertNoContent();
        $this->deleteJson("/api/v1/line-styles/{$styleId}")->assertNoContent();
        $this->assertDatabaseMissing('assets', ['id' => $assetId]);
        $this->assertDatabaseMissing('line_styles', ['id' => $styleId]);
        Storage::disk('s3')->assertMissing($path);
    }

    public function test_official_items_go_to_the_trash_too(): void
    {
        $pack = new AssetPack(['name' => 'Castles', 'kind' => 'stamps', 'tier' => 0, 'published' => true]);
        $pack->save();
        $asset = $pack->assets()->create([
            'name' => 'Keep', 'disk' => 's3', 'path' => "assets/library/{$pack->id}/keep.png",
            'mime' => 'image/png', 'bytes' => 1000, 'width' => 64, 'height' => 64,
        ]);
        $style = new LineStyle(['name' => 'Royal road', 'look' => $this->lineLook(), 'tier' => 0, 'published' => true]);
        $style->save();

        // The editor role manages the official library without a reason.
        $this->asStaff($this->staff(Role::Editor));
        $this->getJson('/api/v1/admin/content/items?type=assets&scope=official')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.official', true)->assertJsonPath('data.0.owner', null);
        $this->deleteJson("/api/v1/admin/content/items/assets/{$asset->id}")->assertNoContent();
        $this->deleteJson("/api/v1/admin/content/items/line_styles/{$style->id}")->assertNoContent();
        $this->assertSoftDeleted('assets', ['id' => $asset->id]);
        $this->assertSoftDeleted('line_styles', ['id' => $style->id]);

        $user = User::factory()->create();
        $this->actingAs($user)->getJson("/api/v1/asset-packs/{$pack->id}/assets")->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/line-styles')->assertJsonCount(0, 'data');

        $this->asStaff($this->staff(Role::Editor))
            ->postJson("/api/v1/admin/content/items/line_styles/{$style->id}/restore")->assertNoContent();
        $this->actingAs($user)->getJson('/api/v1/line-styles')->assertJsonCount(1, 'data');
    }

    public function test_official_templates_are_made_from_a_staff_map(): void
    {
        $admin = $this->staff();
        $map = $this->asStaff($admin)->postJson('/api/v1/maps', [
            'name' => 'Old world', 'width' => 2048, 'height' => 1024,
            'document' => $this->document(),
        ])->assertCreated()->json('data');
        $other = $this->actingAs(User::factory()->create())->postJson('/api/v1/maps', [
            'name' => 'Private', 'width' => 1024, 'height' => 1024, 'document' => $this->document(),
        ])->assertCreated()->json('data');

        // Only from one's own map.
        $this->asStaff($admin)->postJson('/api/v1/admin/content/templates', ['map_id' => $other['id'], 'name' => 'X'])->assertNotFound();
        $tpl = $this->postJson('/api/v1/admin/content/templates', ['map_id' => $map['id'], 'name' => 'Old world', 'name_ar' => 'العالم القديم'])
            ->assertCreated()
            ->assertJsonPath('data.published', false)
            ->assertJsonPath('data.width', 2048)
            ->json('data');
        $this->assertTrue(AuditLog::query()->where('action', 'content.template.created')->exists());

        // A draft is not offered, and its document is not served.
        // Signed out. (The guards are dropped, not the default one switched:
        // these public routes read the Sanctum guard themselves.)
        $guest = function () {
            $this->app['auth']->forgetGuards();
            $this->flushSession();
        };
        $guest();
        $this->getJson('/api/v1/templates')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson("/api/v1/templates/{$tpl['id']}/document")->assertNotFound();

        $this->asStaff($admin)->patchJson("/api/v1/admin/content/templates/{$tpl['id']}", ['published' => true, 'tier' => 1])
            ->assertOk()->assertJsonPath('data.published', true);

        // Above a guest's (and the free plan's) tier: listed as locked, document refused.
        $guest();
        $this->getJson('/api/v1/templates')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name_ar', 'العالم القديم')->assertJsonPath('data.0.locked', true);
        $this->getJson("/api/v1/templates/{$tpl['id']}/document")->assertForbidden()->assertJsonPath('code', 'plan_limit_reached');

        $user = $this->onPlan(User::factory()->create(), 'cartographer');
        $this->actingAs($user)->getJson('/api/v1/templates')->assertJsonPath('data.0.locked', false);
        $this->getJson("/api/v1/templates/{$tpl['id']}/document")->assertOk()->assertJsonPath('name', 'Test map');

        // The trash: gone from the dialog, restorable, then purged with its files.
        $this->asStaff($admin)->deleteJson("/api/v1/admin/content/templates/{$tpl['id']}")->assertNoContent();
        $this->actingAs($user)->getJson('/api/v1/templates')->assertJsonCount(0, 'data');
        $this->asStaff($admin)->postJson("/api/v1/admin/content/templates/{$tpl['id']}/restore")->assertNoContent();
        $this->actingAs($user)->getJson('/api/v1/templates')->assertJsonCount(1, 'data');

        $path = MapTemplate::query()->findOrFail($tpl['id'])->document_path;
        Storage::disk('s3')->assertExists($path);
        $this->asStaff($admin)->deleteJson("/api/v1/admin/content/templates/{$tpl['id']}")->assertNoContent();
        $this->travel(31)->days();
        $this->artisan('content:purge-trashed')->assertSuccessful();
        Storage::disk('s3')->assertMissing($path);
        $this->assertDatabaseMissing('map_templates', ['id' => $tpl['id']]);
    }

    public function test_a_template_cannot_carry_personal_uploads(): void
    {
        $admin = $this->staff();
        $pack = $this->asStaff($admin)->postJson('/api/v1/asset-packs', ['name' => 'Mine', 'kind' => 'stamps'])->assertCreated()->json('data');
        $assetId = $this->post("/api/v1/asset-packs/{$pack['id']}/assets", ['file' => UploadedFile::fake()->image('oak.png', 64, 64)])
            ->assertCreated()->json('data.id');
        $doc = $this->document();
        $doc['layers'][0]['objects'][] = ['id' => 's1', 'kind' => 'stamp', 'asset' => "u:{$assetId}", 'x' => 0.5, 'y' => 0.5, 'size' => 0.05, 'rotation' => 0];
        $map = $this->postJson('/api/v1/maps', ['name' => 'With my oak', 'width' => 1024, 'height' => 1024, 'document' => $doc])
            ->assertCreated()->json('data');

        $this->postJson('/api/v1/admin/content/templates', ['map_id' => $map['id'], 'name' => 'Oak'])
            ->assertUnprocessable()->assertJsonPath('code', 'template_private_assets')->assertJsonPath('count', 1);
        $this->assertSame(0, MapTemplate::query()->count());
    }
}
