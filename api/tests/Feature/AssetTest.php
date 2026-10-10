<?php

namespace Tests\Feature;

use App\Models\Asset;
use App\Models\AssetPack;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AssetTest extends TestCase
{
    private function officialPack(int $tier, bool $published = true): AssetPack
    {
        $pack = new AssetPack(['name' => "Tier {$tier}", 'kind' => 'stamps', 'tier' => $tier, 'published' => $published]);
        $pack->save();
        $pack->assets()->create([
            'name' => 'Castle', 'disk' => 's3', 'path' => "assets/library/{$pack->id}/castle.png",
            'mime' => 'image/png', 'bytes' => 1000, 'width' => 64, 'height' => 64,
        ]);

        return $pack;
    }

    public function test_library_shows_packs_locked_by_plan(): void
    {
        $free = $this->officialPack(0);
        $paid = $this->officialPack(1);
        $this->officialPack(0, published: false); // drafts are hidden
        $user = User::factory()->create();

        $this->actingAs($user)->getJson('/api/v1/asset-packs')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonFragment(['id' => $free->id, 'locked' => false, 'assets_count' => 1])
            ->assertJsonFragment(['id' => $paid->id, 'locked' => true]);

        $this->getJson("/api/v1/asset-packs/{$free->id}/assets")->assertOk()
            ->assertJsonPath('data.0.name', 'Castle')
            ->assertJsonPath('data.0.width', 64);
        $this->getJson("/api/v1/asset-packs/{$paid->id}/assets")->assertForbidden()
            ->assertJsonPath('code', 'plan_limit_reached');

        $this->onPlan($user, 'cartographer');
        $this->getJson("/api/v1/asset-packs/{$paid->id}/assets")->assertOk();
    }

    public function test_free_plan_cannot_upload(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->postJson('/api/v1/asset-packs', ['name' => 'Mine', 'kind' => 'stamps'])
            ->assertForbidden()->assertJsonPath('limit', 'upload_bytes');
    }

    public function test_subscribers_upload_into_their_own_packs_within_quota(): void
    {
        $user = $this->onPlan(User::factory()->create(), 'cartographer');
        $pack = $this->actingAs($user)->postJson('/api/v1/asset-packs', ['name' => 'My stamps', 'kind' => 'stamps'])
            ->assertCreated()->assertJsonPath('data.official', false)->json('data');

        $asset = $this->post("/api/v1/asset-packs/{$pack['id']}/assets", [
            'file' => UploadedFile::fake()->image('tower.png', 128, 96),
            'tags' => ['castle', 'tower'],
        ])->assertCreated()
            ->assertJsonPath('data.name', 'tower')
            ->assertJsonPath('data.width', 128)
            ->assertJsonPath('data.tags', ['castle', 'tower'])
            ->json('data');
        Storage::disk('s3')->assertExists(Asset::find($asset['id'])->path);

        $this->getJson('/api/v1/auth/me')->assertJsonPath('data.usage.upload_bytes', Asset::find($asset['id'])->bytes);

        // SVG is refused (it can carry scripts).
        $this->post("/api/v1/asset-packs/{$pack['id']}/assets", [
            'file' => UploadedFile::fake()->create('x.svg', 1, 'image/svg+xml'),
        ])->assertUnprocessable();

        // Over the quota.
        \App\Models\Plan::query()->where('code', 'cartographer')->update(['upload_quota_bytes' => 10]);
        $this->post("/api/v1/asset-packs/{$pack['id']}/assets", [
            'file' => UploadedFile::fake()->image('big.png', 64, 64),
        ])->assertForbidden()->assertJsonPath('limit', 'upload_bytes');
    }

    public function test_users_cannot_touch_other_packs(): void
    {
        $owner = $this->onPlan(User::factory()->create(), 'cartographer');
        $pack = $this->actingAs($owner)->postJson('/api/v1/asset-packs', ['name' => 'Mine', 'kind' => 'textures'])->json('data');
        $official = $this->officialPack(0);
        $other = $this->onPlan(User::factory()->create(), 'atlas');

        $this->actingAs($other)->getJson("/api/v1/asset-packs/{$pack['id']}/assets")->assertForbidden();
        $this->post("/api/v1/asset-packs/{$pack['id']}/assets", ['file' => UploadedFile::fake()->image('a.png')])->assertForbidden();
        $this->post("/api/v1/asset-packs/{$official->id}/assets", ['file' => UploadedFile::fake()->image('a.png')])->assertForbidden();
        $this->deleteJson("/api/v1/asset-packs/{$official->id}")->assertForbidden();
        $this->deleteJson('/api/v1/assets/'.$official->assets()->first()->id)->assertForbidden();
        $this->actingAs($other)->postJson('/api/v1/asset-packs', ['name' => 'Fake official', 'kind' => 'stamps', 'official' => true])->assertForbidden();
    }

    public function test_admins_manage_the_official_library(): void
    {
        $admin = User::factory()->admin()->create();
        $pack = $this->actingAs($admin)->postJson('/api/v1/asset-packs', [
            'name' => 'Medieval', 'kind' => 'stamps', 'official' => true, 'tier' => 1,
        ])->assertCreated()->assertJsonPath('data.official', true)->assertJsonPath('data.published', false)->json('data');

        $this->post("/api/v1/asset-packs/{$pack['id']}/assets", ['file' => UploadedFile::fake()->image('keep.png')])->assertCreated();
        $this->patchJson("/api/v1/asset-packs/{$pack['id']}", ['published' => true])->assertOk()->assertJsonPath('data.published', true);

        // Now visible (locked) to free users.
        $this->actingAs(User::factory()->create())->getJson('/api/v1/asset-packs?kind=stamps')
            ->assertJsonFragment(['id' => $pack['id'], 'locked' => true]);

        $this->actingAs($admin)->deleteJson("/api/v1/asset-packs/{$pack['id']}")->assertNoContent();
        $this->assertDatabaseCount('assets', 0);
        $this->assertSame([], Storage::disk('s3')->allFiles('assets'));
    }
}
