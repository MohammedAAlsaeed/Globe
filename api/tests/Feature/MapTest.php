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

    public function test_exports_of_maps_kept_on_the_device_are_checked_too(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $this->postJson('/api/v1/exports', ['width' => 4096, 'height' => 3072])
            ->assertForbidden()->assertJsonPath('limit', 'export_px')->assertJsonPath('max', 2048);
        $this->postJson('/api/v1/exports', ['width' => 2048, 'height' => 1536])
            ->assertCreated()->assertJsonPath('data.plan', 'explorer');
        $this->assertDatabaseHas('exports', ['user_id' => $user->id, 'map_id' => null, 'width' => 2048]);

        // Guests have no account to check against.
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/v1/exports', ['width' => 512, 'height' => 512])->assertUnauthorized();
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

    public function test_line_tool_lines_are_validated_on_save(): void
    {
        $user = User::factory()->create();
        $line = LineStyleTest::look() + [
            'id' => 'line-1', 'kind' => 'line', 'closed' => false, 'name' => 'Northern Road', 'styleId' => 'p:dirtRoad',
            'nodes' => [['x' => 0.1, 'y' => 0.2], ['x' => 0.4, 'y' => 0.3, 't' => 'smooth', 'hi' => ['x' => -0.05, 'y' => 0], 'ho' => ['x' => 0.05, 'y' => 0]], ['x' => 0.7, 'y' => 0.2]],
        ];
        $doc = fn (array $l) => ['id' => 'x', 'name' => 'Lines', 'layers' => [['id' => 'l1', 'name' => 'Roads', 'visible' => true, 'locked' => false, 'opacity' => 1, 'objects' => [$l, ['id' => 's', 'kind' => 'stamp']]]]];

        $map = $this->createMap($user, ['document' => $doc($line)]);
        $this->getJson("/api/v1/maps/{$map['id']}")->assertOk()
            ->assertJsonPath('document.layers.0.objects.0.nodes.1.t', 'smooth')
            ->assertJsonPath('document.layers.0.objects.0.name', 'Northern Road');

        $broken = [
            'one node' => ['nodes' => [['x' => 0.1, 'y' => 0.1]]],
            'out of range' => ['nodes' => [['x' => 0.1, 'y' => 0.1], ['x' => 99, 'y' => 0.1]]],
            'closed with two nodes' => ['closed' => true, 'nodes' => [['x' => 0.1, 'y' => 0.1], ['x' => 0.2, 'y' => 0.1]]],
            'bad pattern' => ['stroke' => ['pattern' => 'zigzag'] + $line['stroke']],
            'too many nodes' => ['nodes' => array_fill(0, 2001, ['x' => 0.5, 'y' => 0.5])],
        ];
        foreach ($broken as $why => $patch) {
            $this->putJson("/api/v1/maps/{$map['id']}", ['revision' => 1, 'document' => $doc(array_replace($line, $patch))])
                ->assertUnprocessable()->assertJsonValidationErrors('document');
        }
        // Still at revision 1: nothing broken was stored.
        $this->getJson("/api/v1/maps/{$map['id']}")->assertJsonPath('data.revision', 1);
    }

    public function test_text_tool_texts_are_validated_on_save(): void
    {
        $user = User::factory()->create();
        $text = TextStyleTest::look() + [
            'id' => 'text-1', 'kind' => 'text', 'text' => "مملكة الأندلس\nKingdom of Andalusia", 'x' => 0.5, 'y' => 0.2, 'rotation' => -12,
            'boxWidth' => null, 'styleId' => 't:kingdomTitle', 'attach' => ['to' => 's', 'dx' => 0.01, 'dy' => -0.02],
            'path' => ['nodes' => [['x' => 0.2, 'y' => 0.3], ['x' => 0.5, 'y' => 0.25, 't' => 'smooth', 'hi' => ['x' => -0.1, 'y' => 0], 'ho' => ['x' => 0.1, 'y' => 0]], ['x' => 0.8, 'y' => 0.3]],
                'reverse' => false, 'align' => 'center', 'offset' => 0, 'side' => 'above', 'baseline' => 0.1, 'smooth' => true],
        ];
        $doc = fn (array $t) => ['id' => 'x', 'name' => 'Texts', 'layers' => [['id' => 'l1', 'name' => 'Names', 'visible' => true, 'locked' => false, 'opacity' => 1, 'objects' => [$t, ['id' => 's', 'kind' => 'stamp']]]]];

        $map = $this->createMap($user, ['document' => $doc($text)]);
        $this->getJson("/api/v1/maps/{$map['id']}")->assertOk()
            ->assertJsonPath('document.layers.0.objects.0.text', "مملكة الأندلس\nKingdom of Andalusia")
            ->assertJsonPath('document.layers.0.objects.0.path.nodes.1.t', 'smooth')
            ->assertJsonPath('document.layers.0.objects.0.features.dlig', true);

        $broken = [
            'empty' => ['text' => ''],
            'too long' => ['text' => str_repeat('م', 2001)],
            'off the map' => ['x' => 50],
            'bad width' => ['boxWidth' => -1],
            'bad font' => ['font' => '<b>'],
            'bad path' => ['path' => ['nodes' => [['x' => 0.1, 'y' => 0.1]]] + $text['path']],
            'bad link' => ['attach' => ['to' => 's', 'dx' => 'far', 'dy' => 0]],
            'bad outline' => ['outline' => ['position' => 'inside'] + $text['outline']],
        ];
        foreach ($broken as $why => $patch) {
            $this->putJson("/api/v1/maps/{$map['id']}", ['revision' => 1, 'document' => $doc(array_replace($text, $patch))])
                ->assertUnprocessable()->assertJsonValidationErrors('document');
        }
        $this->getJson("/api/v1/maps/{$map['id']}")->assertJsonPath('data.revision', 1);
    }
}
