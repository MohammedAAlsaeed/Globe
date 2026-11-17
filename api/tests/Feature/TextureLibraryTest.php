<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\Asset;
use App\Models\AssetPack;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class TextureLibraryTest extends TestCase
{
    private function officialTextures(int $tier, bool $published = true, ?string $style = 'Idrisi'): AssetPack
    {
        $pack = new AssetPack(['name' => "Papers {$tier}", 'kind' => 'textures', 'style' => $style, 'tier' => $tier, 'published' => $published]);
        $pack->save();
        $pack->assets()->create([
            'name' => 'Old vellum', 'category' => 'paper', 'tags' => ['vellum', 'رق'],
            'disk' => 's3', 'path' => "assets/library/{$pack->id}/vellum.webp", 'thumb_path' => "assets/library/{$pack->id}/vellum.thumb.webp",
            'mime' => 'image/webp', 'bytes' => 1000, 'width' => 1024, 'height' => 1024, 'color' => '#d8c9a3', 'meta' => ['tile' => true, 'scale' => 1.5],
        ]);

        return $pack;
    }

    /** A texture source exactly as the editor saves it. */
    private function source(array $override = []): array
    {
        return array_replace([
            'type' => 'texture', 'color' => '#c9b98a', 'texture' => 'parchment', 'textureScale' => 1, 'textureRotation' => 0,
            'textureOffsetX' => 0.25, 'textureOffsetY' => 0, 'hue' => 0, 'saturation' => 0, 'brightness' => 0, 'contrast' => 0,
        ], $override);
    }

    public function test_guests_see_the_published_library_with_previews_only_where_locked(): void
    {
        $free = $this->officialTextures(0);
        $paid = $this->officialTextures(1);
        $this->officialTextures(0, published: false); // a draft
        (new AssetPack(['name' => 'Stamps', 'kind' => 'stamps', 'tier' => 0, 'published' => true]))->save();

        $res = $this->getJson('/api/v1/texture-library')->assertOk()
            ->assertJsonCount(2, 'data.packs')
            ->assertJsonCount(2, 'data.textures')
            ->assertJsonPath('data.packs.0.style', 'Idrisi')
            ->assertJsonPath('data.packs.0.official', true)
            ->assertJsonPath('data.packs.0.mine', false);
        $byPack = collect($res->json('data.textures'))->keyBy('pack_id');
        $this->assertNotNull($byPack[$free->id]['url']);
        $this->assertNull($byPack[$paid->id]['url']);
        $this->assertStringContainsString('vellum.thumb.webp', $byPack[$paid->id]['thumb_url']);
        $this->assertSame('#d8c9a3', $byPack[$free->id]['color']);
        $this->assertEquals(['tile' => true, 'scale' => 1.5], $byPack[$free->id]['meta']);
        $this->assertSame(['vellum', 'رق'], $byPack[$free->id]['tags']);

        // On a plan that includes it, the paid pack opens; admins also see drafts.
        $user = $this->onPlan(User::factory()->create(), 'cartographer');
        $this->actingAs($user)->getJson('/api/v1/texture-library')
            ->assertJsonPath('data.packs.1.locked', false);
        $admin = User::factory()->create();
        $admin->forceFill(['role' => Role::Admin])->save();
        // A new request (the Sanctum guard remembers the last person within a test).
        $this->app['auth']->forgetGuards();
        $this->actingAs($admin)->getJson('/api/v1/texture-library')->assertJsonCount(3, 'data.packs');
    }

    public function test_people_upload_their_own_textures_with_previews(): void
    {
        $user = User::factory()->create();
        $pack = $this->actingAs($user)->postJson('/api/v1/asset-packs', ['name' => 'My textures', 'kind' => 'textures'])
            ->assertCreated()->json('data');
        $asset = $this->post("/api/v1/asset-packs/{$pack['id']}/assets", [
            'file' => UploadedFile::fake()->image('sand.png', 512, 512),
            'thumbnail' => UploadedFile::fake()->image('sand-preview.png', 128, 128),
            'color' => '#d9b77a',
            'category' => 'desert',
            'tags' => ['sand', 'dunes'],
            'meta' => ['tile' => true, 'scale' => 2],
        ])->assertCreated()
            ->assertJsonPath('data.category', 'desert')
            ->assertJsonPath('data.color', '#d9b77a')
            ->assertJsonPath('data.meta.scale', fn ($v) => (float) $v === 2.0)
            ->json('data');
        $stored = Asset::query()->findOrFail($asset['id']);
        Storage::disk('s3')->assertExists($stored->thumb_path);
        $this->assertStringContainsString('.thumb.', $asset['thumb_url']);

        // Listed under "me", with the picture.
        $this->getJson('/api/v1/texture-library')->assertOk()
            ->assertJsonPath('data.packs.0.mine', true)
            ->assertJsonPath('data.textures.0.id', $asset['id']);

        // Wrong categories, previews too large and odd meta are refused.
        $this->post("/api/v1/asset-packs/{$pack['id']}/assets", ['file' => UploadedFile::fake()->image('a.png', 64, 64), 'category' => 'castles'])
            ->assertUnprocessable();
        $this->post("/api/v1/asset-packs/{$pack['id']}/assets", ['file' => UploadedFile::fake()->image('a.png', 64, 64), 'thumbnail' => UploadedFile::fake()->image('t.png', 900, 900)])
            ->assertUnprocessable();
        $this->post("/api/v1/asset-packs/{$pack['id']}/assets", ['file' => UploadedFile::fake()->image('a.png', 64, 64), 'meta' => ['scale' => 50]])
            ->assertUnprocessable();

        // Deleting removes the picture and its preview.
        $this->deleteJson("/api/v1/assets/{$asset['id']}")->assertNoContent();
        Storage::disk('s3')->assertMissing($stored->path);
        Storage::disk('s3')->assertMissing($stored->thumb_path);
    }

    public function test_favourite_textures_follow_the_account(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->getJson('/api/v1/auth/me/texture-favorites')->assertOk()
            ->assertJsonPath('data.items', [])->assertJsonPath('data.updated_at', 0);

        $items = [
            ['id' => 'f1', 'source' => $this->source()],
            ['id' => 'f2', 'source' => $this->source(['texture' => 'u:01JC0000000000000000000000', 'textureScale' => 2.5, 'hue' => 30])],
        ];
        $this->putJson('/api/v1/auth/me/texture-favorites', ['items' => $items, 'updated_at' => 1700000000000])->assertOk();
        $this->getJson('/api/v1/auth/me/texture-favorites')
            ->assertJsonCount(2, 'data.items')
            ->assertJsonPath('data.items.1.source.textureScale', 2.5)
            ->assertJsonPath('data.items.0.source.textureOffsetX', 0.25)
            ->assertJsonPath('data.updated_at', 1700000000000);

        foreach ([
            'unknown texture' => $this->source(['texture' => 'marble']),
            'colour' => $this->source(['type' => 'color']),
            'offset' => $this->source(['textureOffsetX' => 3]),
            'scale' => $this->source(['textureScale' => 'big']),
        ] as $case => $bad) {
            $this->putJson('/api/v1/auth/me/texture-favorites', ['items' => [['id' => 'x', 'source' => $bad]], 'updated_at' => 1])
                ->assertUnprocessable();
        }
        $this->putJson('/api/v1/auth/me/texture-favorites', [
            'items' => array_fill(0, 61, ['id' => 'x', 'source' => $this->source()]), 'updated_at' => 1,
        ])->assertUnprocessable();
    }

    public function test_shape_styles_may_use_uploaded_textures_and_offsets(): void
    {
        $user = User::factory()->create();
        $look = ShapeStyleTest::look();
        $look['fill']['source'] = $this->source(['texture' => 'u:01JC0000000000000000000000']);
        $this->actingAs($user)->postJson('/api/v1/shape-styles', ['name' => 'Vellum', 'look' => $look])->assertCreated();

        $look['fill']['source'] = $this->source(['texture' => 'u:not-an-id']);
        $this->postJson('/api/v1/shape-styles', ['name' => 'Bad', 'look' => $look])->assertUnprocessable();
    }
}
