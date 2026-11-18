<?php

namespace Tests\Feature;

use App\Models\AssetPack;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class StampLibraryTest extends TestCase
{
    private function officialStamps(int $tier, bool $published = true, ?string $style = 'Idrisi'): AssetPack
    {
        $pack = new AssetPack(['name' => "Castles {$tier}", 'kind' => 'stamps', 'style' => $style, 'tier' => $tier, 'published' => $published]);
        $pack->save();
        foreach ([1, 2] as $n) {
            $pack->assets()->create([
                'name' => "Castle {$n}", 'set_key' => 'castles', 'category' => 'settlements', 'tags' => ['fort', 'قلعة'],
                'disk' => 's3', 'path' => "assets/library/{$pack->id}/castle-{$n}.webp", 'thumb_path' => "assets/library/{$pack->id}/castle-{$n}.thumb.webp",
                'mime' => 'image/webp', 'bytes' => 1000, 'width' => 300, 'height' => 240, 'meta' => ['pivot' => 'base', 'size' => 0.06],
            ]);
        }

        return $pack;
    }

    /** A favourite exactly as the editor saves it. */
    private function favorite(array $look = [], array $override = []): array
    {
        return array_replace([
            'id' => 'f1', 'set' => 'mountain', 'variant' => null,
            'look' => array_replace([
                'size' => 0.07, 'rotation' => 0, 'flipX' => false, 'flipY' => false, 'ink' => '#3a2e22', 'fill' => '#e6d8b8',
                'opacity' => 1, 'hue' => 0, 'saturation' => 0, 'brightness' => 0, 'contrast' => 0, 'shadow' => 'default',
                'stretch' => 1, 'pivot' => 'base',
            ], $look),
        ], $override);
    }

    public function test_guests_see_the_published_stamps_with_sets_and_previews_only_where_locked(): void
    {
        $free = $this->officialStamps(0);
        $paid = $this->officialStamps(1);
        $this->officialStamps(0, published: false); // a draft
        (new AssetPack(['name' => 'Papers', 'kind' => 'textures', 'tier' => 0, 'published' => true]))->save();

        $res = $this->getJson('/api/v1/stamp-library')->assertOk()
            ->assertJsonCount(2, 'data.packs')
            ->assertJsonCount(4, 'data.stamps')
            ->assertJsonPath('data.packs.0.style', 'Idrisi');
        $stamps = collect($res->json('data.stamps'));
        $mine = $stamps->firstWhere('pack_id', $free->id);
        $this->assertSame('castles', $mine['set_key']);
        $this->assertSame('settlements', $mine['category']);
        $this->assertEquals(['pivot' => 'base', 'size' => 0.06], $mine['meta']);
        $this->assertNotNull($mine['url']);
        $locked = $stamps->firstWhere('pack_id', $paid->id);
        $this->assertNull($locked['url']);
        $this->assertStringContainsString('.thumb.webp', $locked['thumb_url']);
    }

    public function test_people_file_their_own_stamps_with_how_they_are_placed(): void
    {
        $user = User::factory()->create();
        $pack = $this->actingAs($user)->postJson('/api/v1/asset-packs', ['name' => 'Mine', 'kind' => 'stamps'])->json('data');
        $id = $this->post("/api/v1/asset-packs/{$pack['id']}/assets", [
            'file' => UploadedFile::fake()->image('tower.png', 80, 160),
            'thumbnail' => UploadedFile::fake()->image('tower-preview.png', 64, 128),
            'set_key' => 'towers',
            'category' => 'creatures',
            'tags' => ['dragon'],
            'meta' => ['pivot' => 'center', 'size' => '0.05', 'shadow' => '1'],
        ])->assertCreated()
            ->assertJsonPath('data.category', 'creatures')
            ->assertJsonPath('data.meta.pivot', 'center')
            ->assertJsonPath('data.meta.shadow', true)
            ->json('data.id');
        $this->assertSame(0.05, $this->getJson('/api/v1/stamp-library')->json('data.stamps.0.meta.size'));
        $this->getJson('/api/v1/stamp-library')->assertJsonPath('data.packs.0.mine', true);

        $this->patchJson("/api/v1/assets/{$id}", ['meta' => ['pivot' => 'sideways']])->assertUnprocessable();
        $this->patchJson("/api/v1/assets/{$id}", ['category' => 'spaceships'])->assertUnprocessable();
        $this->patchJson("/api/v1/assets/{$id}", ['category' => 'decorations', 'meta' => ['pivot' => 'base']])
            ->assertOk()->assertJsonPath('data.meta.pivot', 'base');
    }

    public function test_favourite_stamps_follow_the_account(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->getJson('/api/v1/auth/me/stamp-favorites')
            ->assertOk()->assertJsonPath('data.items', [])->assertJsonPath('data.updated_at', 0);

        $this->putJson('/api/v1/auth/me/stamp-favorites', [
            'items' => [
                $this->favorite(['size' => 0.05, 'hue' => 30, 'extra' => 'dropped']),
                $this->favorite([], ['id' => 'f2', 'set' => 's:01JC0000000000000000000000:castles', 'variant' => 1]),
            ],
            'updated_at' => 1700000000000,
        ])->assertOk();
        $saved = $this->getJson('/api/v1/auth/me/stamp-favorites')->json('data');
        $this->assertSame(1700000000000, $saved['updated_at']);
        $this->assertSame(0.05, $saved['items'][0]['look']['size']);
        $this->assertSame(30, $saved['items'][0]['look']['hue']);
        $this->assertArrayNotHasKey('extra', $saved['items'][0]['look']);
        $this->assertSame(1, $saved['items'][1]['variant']);

        foreach ([
            'no size' => $this->favorite(['size' => null]),
            'colour' => $this->favorite(['ink' => 'red']),
            'shadow' => $this->favorite(['shadow' => 'huge']),
            'set' => $this->favorite([], ['set' => 'a set with spaces']),
        ] as $case => $bad) {
            $this->putJson('/api/v1/auth/me/stamp-favorites', ['items' => [$bad], 'updated_at' => 1])
                ->assertUnprocessable();
        }
        $this->putJson('/api/v1/auth/me/stamp-favorites', [
            'items' => array_fill(0, 61, $this->favorite()), 'updated_at' => 1,
        ])->assertUnprocessable();
    }
}
