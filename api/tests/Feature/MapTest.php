<?php

namespace Tests\Feature;

use App\Models\Map;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MapTest extends TestCase
{
    private function createMap(User $user, array $overrides = []): array
    {
        return $this->actingAs($user)->postJson('/api/v1/maps', $overrides + [
            'name' => 'World',
            'width' => 2048,
            'height' => 1536,
            'document' => $this->document(),
        ])->assertCreated()->json('data');
    }

    public function test_a_map_round_trips_exactly(): void
    {
        $user = User::factory()->create();
        $doc = $this->document(['coast' => (object) [], 'label' => 'مرسم الإدريسي']);
        $map = $this->actingAs($user)->postJson('/api/v1/maps', [
            'name' => 'World', 'width' => 2048, 'height' => 1536, 'document' => $doc,
        ])->assertCreated()
            ->assertJsonPath('data.revision', 1)
            ->assertJsonPath('data.name', 'World')
            ->json('data');

        $res = $this->getJson("/api/v1/maps/{$map['id']}")->assertOk();
        $body = json_decode($res->getContent());
        // Stored as sent: an empty object stays an object, Arabic as-is.
        $this->assertIsObject($body->document->coast);
        $this->assertSame('مرسم الإدريسي', $body->document->label);
        $this->assertStringContainsString('"coast":{}', $res->getContent());
        $this->assertSame($map['id'], $body->data->id);

        // Stored compressed, on the user's region disk.
        $stored = Map::find($map['id']);
        $this->assertSame('s3', $stored->disk);
        Storage::disk('s3')->assertExists($stored->document_path);
        $this->assertStringEndsWith('.json.gz', $stored->document_path);
    }

    public function test_free_plan_allows_three_maps(): void
    {
        $user = User::factory()->create();
        foreach (range(1, 3) as $_) {
            $this->createMap($user);
        }
        $this->actingAs($user)->postJson('/api/v1/maps', [
            'name' => 'Fourth', 'width' => 1024, 'height' => 768, 'document' => $this->document(),
        ])->assertForbidden()
            ->assertJsonPath('code', 'plan_limit_reached')
            ->assertJsonPath('limit', 'maps')
            ->assertJsonPath('max', 3);

        $this->getJson('/api/v1/maps')->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('limits.count', 3)
            ->assertJsonPath('limits.max', 3);

        // Deleting one frees a slot.
        $first = Map::query()->first();
        $this->deleteJson("/api/v1/maps/{$first->id}")->assertNoContent();
        $this->createMap($user);
    }

    public function test_paid_plans_raise_the_limit(): void
    {
        $user = $this->onPlan(User::factory()->create(), 'atlas');
        foreach (range(1, 5) as $_) {
            $this->createMap($user);
        }
        $this->getJson('/api/v1/maps')->assertJsonPath('limits.max', null);
    }

    public function test_saving_requires_the_current_revision(): void
    {
        $user = User::factory()->create();
        $map = $this->createMap($user);

        $this->putJson("/api/v1/maps/{$map['id']}", [
            'revision' => 1, 'name' => 'Renamed', 'document' => $this->document(['v' => 2]),
        ])->assertOk()->assertJsonPath('data.revision', 2)->assertJsonPath('data.name', 'Renamed');

        // Another device still on revision 1 can't overwrite revision 2.
        $this->putJson("/api/v1/maps/{$map['id']}", [
            'revision' => 1, 'document' => $this->document(['v' => 'stale']),
        ])->assertStatus(409)
            ->assertJsonPath('code', 'revision_conflict')
            ->assertJsonPath('current_revision', 2);

        $this->assertSame(2, json_decode($this->getJson("/api/v1/maps/{$map['id']}")->getContent())->document->v);
        // The earlier revision is kept for restore.
        $this->assertDatabaseHas('map_versions', ['map_id' => $map['id'], 'revision' => 1]);
    }

    public function test_old_revisions_are_pruned(): void
    {
        config(['idrisi.maps.keep_versions' => 2]);
        $user = User::factory()->create();
        $map = $this->createMap($user);
        foreach (range(1, 4) as $rev) {
            $this->putJson("/api/v1/maps/{$map['id']}", ['revision' => $rev, 'document' => $this->document(['v' => $rev])])->assertOk();
        }
        $this->assertSame([3, 4], Map::find($map['id'])->versions()->orderBy('revision')->pluck('revision')->all());
        $this->assertCount(3, Storage::disk('s3')->files("maps/{$user->id}/{$map['id']}"));
    }

    public function test_maps_are_private(): void
    {
        $owner = User::factory()->create();
        $map = $this->createMap($owner);
        $intruder = User::factory()->create();

        $this->actingAs($intruder)->getJson("/api/v1/maps/{$map['id']}")->assertForbidden();
        $this->actingAs($intruder)->putJson("/api/v1/maps/{$map['id']}", ['revision' => 1, 'document' => $this->document()])->assertForbidden();
        $this->actingAs($intruder)->deleteJson("/api/v1/maps/{$map['id']}")->assertForbidden();
        $this->actingAs($intruder)->getJson('/api/v1/maps')->assertJsonCount(0, 'data');
    }

    public function test_document_validation(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->postJson('/api/v1/maps', ['name' => 'X', 'width' => 10, 'height' => 100000, 'document' => 'nope'])
            ->assertUnprocessable()->assertJsonValidationErrors(['width', 'height', 'document']);
        $this->postJson('/api/v1/maps', ['name' => 'X', 'width' => 512, 'height' => 512, 'document' => ['no' => 'layers']])
            ->assertUnprocessable()->assertJsonValidationErrors(['document.layers']);

        config(['idrisi.maps.max_document_bytes' => 200]);
        $this->postJson('/api/v1/maps', ['name' => 'X', 'width' => 512, 'height' => 512, 'document' => $this->document(['pad' => str_repeat('x', 500)])])
            ->assertUnprocessable()->assertJsonValidationErrors(['document']);
    }

    public function test_rename_and_thumbnail(): void
    {
        $user = User::factory()->create();
        $map = $this->createMap($user);

        $this->patchJson("/api/v1/maps/{$map['id']}", ['name' => 'Atlas of Al-Andalus'])
            ->assertOk()->assertJsonPath('data.name', 'Atlas of Al-Andalus')->assertJsonPath('data.revision', 1);

        $res = $this->post("/api/v1/maps/{$map['id']}/thumbnail", [
            'thumbnail' => UploadedFile::fake()->image('thumb.png', 320, 240),
        ])->assertOk();
        $this->assertNotNull($res->json('data.thumbnail_url'));
        Storage::disk('s3')->assertExists(Map::find($map['id'])->thumbnail_path);
    }

    public function test_exports_follow_the_plan_and_record_the_license(): void
    {
        $user = User::factory()->create();
        $map = $this->createMap($user);

        $this->postJson("/api/v1/maps/{$map['id']}/exports", ['width' => 4096, 'height' => 3072])
            ->assertForbidden()->assertJsonPath('limit', 'export_px')->assertJsonPath('max', 2048);
        $this->postJson("/api/v1/maps/{$map['id']}/exports", ['width' => 2048, 'height' => 1536])
            ->assertCreated()->assertJsonPath('data.commercial_use', false)->assertJsonPath('data.plan', 'explorer');

        $this->onPlan($user, 'atlas');
        $this->postJson("/api/v1/maps/{$map['id']}/exports", ['width' => 16384, 'height' => 12288])
            ->assertCreated()->assertJsonPath('data.commercial_use', true)->assertJsonPath('data.plan', 'atlas');

        $this->assertDatabaseCount('exports', 2);
    }

    public function test_purging_the_trash_deletes_files(): void
    {
        $user = User::factory()->create();
        $map = $this->createMap($user);
        $this->deleteJson("/api/v1/maps/{$map['id']}")->assertNoContent();

        $this->artisan('maps:purge-trashed')->assertSuccessful();
        $this->assertSoftDeleted('maps', ['id' => $map['id']]); // too recent

        $this->travel(31)->days();
        $this->artisan('maps:purge-trashed')->assertSuccessful();
        $this->assertDatabaseMissing('maps', ['id' => $map['id']]);
        $this->assertSame([], Storage::disk('s3')->allFiles("maps/{$user->id}"));
    }
}
