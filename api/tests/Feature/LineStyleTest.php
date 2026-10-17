<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\LineStyle;
use App\Models\User;
use Tests\TestCase;

class LineStyleTest extends TestCase
{
    /** A look exactly as the Line Tool saves it. */
    public static function look(array $override = []): array
    {
        return array_replace_recursive([
            'mode' => 'color',
            'stroke' => [
                'color' => '#8f6d45', 'width' => 0.0045, 'pattern' => 'dashed', 'dash' => 3, 'gap' => 2,
                'cap' => 'round', 'join' => 'round', 'blur' => 0.2, 'casing' => 0, 'casingColor' => '#3a2e22',
            ],
            'stamp' => [
                'set' => 'lb:stoneWall',
                'parts' => ['seg' => ['b:ln-stoneWall:0', 'b:ln-stoneWall:1'], 'start' => 'b:ln-stoneWallBlock:0', 'end' => null, 'corner' => null],
                'ink' => '#3a2e22', 'fill' => '#c9bda3', 'size' => 0.009, 'spacing' => 0, 'rotation' => 0,
                'followPath' => true, 'offset' => 0, 'flip' => false, 'fit' => true, 'corners' => 'split', 'caps' => true,
                'scaleJitter' => 0, 'rotationJitter' => 0, 'anchor' => 'center', 'seed' => 12345,
            ],
            'opacity' => 0.9,
        ], $override);
    }

    public function test_people_save_and_list_their_own_styles(): void
    {
        $user = User::factory()->create();
        $created = $this->actingAs($user)->postJson('/api/v1/line-styles', ['name' => 'Old road', 'look' => self::look()])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Old road')
            ->assertJsonPath('data.official', false)
            ->assertJsonPath('data.locked', false)
            ->assertJsonPath('data.look.stroke.pattern', 'dashed')
            ->json('data');

        $this->getJson('/api/v1/line-styles')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $created['id'])
            ->assertJsonPath('data.0.look.stamp.parts.seg.1', 'b:ln-stoneWall:1')
            ->assertJsonPath('limits', ['count' => 1, 'max' => 10]);

        $this->patchJson("/api/v1/line-styles/{$created['id']}", ['name' => 'Older road'])->assertOk()
            ->assertJsonPath('data.name', 'Older road');
        // The person's usage is part of their account.
        $this->getJson('/api/v1/auth/me')->assertJsonPath('data.usage.line_styles', 1)
            ->assertJsonPath('data.plan.max_line_styles', 10);

        // Other people can't see, change or delete it.
        $other = User::factory()->create();
        $this->actingAs($other)->getJson('/api/v1/line-styles')->assertJsonCount(0, 'data');
        $this->patchJson("/api/v1/line-styles/{$created['id']}", ['name' => 'Mine'])->assertForbidden();
        $this->deleteJson("/api/v1/line-styles/{$created['id']}")->assertForbidden();

        $this->actingAs($user)->deleteJson("/api/v1/line-styles/{$created['id']}")->assertNoContent();
        $this->assertDatabaseCount('line_styles', 0);
    }

    public function test_the_plan_caps_how_many_styles_are_saved(): void
    {
        $user = User::factory()->create();
        for ($i = 0; $i < 10; $i++) {
            $this->actingAs($user)->postJson('/api/v1/line-styles', ['name' => "S{$i}", 'look' => self::look()])->assertCreated();
        }
        $this->postJson('/api/v1/line-styles', ['name' => 'One more', 'look' => self::look()])
            ->assertForbidden()
            ->assertJsonPath('code', 'plan_limit_reached')
            ->assertJsonPath('limit', 'line_styles')
            ->assertJsonPath('max', 10);

        // A bigger plan allows more; Atlas is unlimited.
        $this->onPlan($user, 'atlas');
        $this->postJson('/api/v1/line-styles', ['name' => 'One more', 'look' => self::look()])->assertCreated();
        $this->getJson('/api/v1/line-styles')->assertJsonPath('limits.max', null);
    }

    public function test_looks_are_validated_like_the_editor_does(): void
    {
        $user = User::factory()->create();
        $bad = [
            'mode' => self::look(['mode' => 'neon']),
            'width' => self::look(['stroke' => ['width' => 3]]),
            'pattern' => self::look(['stroke' => ['pattern' => 'zigzag']]),
            'color' => self::look(['stroke' => ['color' => 'red']]),
            'asset' => self::look(['stamp' => ['parts' => ['seg' => ['javascript:alert(1)']]]]),
            'spacing' => self::look(['stamp' => ['spacing' => -5]]),
            'opacity' => self::look(['opacity' => 2]),
            'blend' => self::look(['blend' => 'xor']),
        ];
        foreach ($bad as $why => $look) {
            $this->actingAs($user)->postJson('/api/v1/line-styles', ['name' => $why, 'look' => $look])
                ->assertUnprocessable()->assertJsonValidationErrors('look');
        }
        // A null fill (pieces without a body colour) and a blend mode are fine.
        $this->postJson('/api/v1/line-styles', ['name' => 'ok', 'look' => self::look(['blend' => 'multiply', 'stamp' => ['fill' => null]])])
            ->assertCreated();
    }

    public function test_admins_publish_official_styles_locked_above_a_plan(): void
    {
        $admin = User::factory()->create();
        $admin->forceFill(['role' => Role::Admin])->save();
        $free = $this->actingAs($admin)->postJson('/api/v1/line-styles', ['name' => 'Royal road', 'look' => self::look(), 'official' => true, 'published' => true])
            ->assertCreated()->assertJsonPath('data.official', true)->json('data');
        $paid = $this->postJson('/api/v1/line-styles', ['name' => 'Gilded border', 'look' => self::look(), 'official' => true, 'tier' => 1, 'published' => true])
            ->assertCreated()->json('data');
        $this->postJson('/api/v1/line-styles', ['name' => 'Draft', 'look' => self::look(), 'official' => true])->assertCreated();
        // Admins see drafts too.
        $this->getJson('/api/v1/line-styles')->assertJsonCount(3, 'data');

        $user = User::factory()->create();
        $this->actingAs($user)->getJson('/api/v1/line-styles')->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonFragment(['id' => $free['id'], 'locked' => false])
            ->assertJsonFragment(['id' => $paid['id'], 'locked' => true, 'look' => null]);
        // Official styles don't count toward the person's own limit.
        $this->getJson('/api/v1/line-styles')->assertJsonPath('limits.count', 0);
        // People can't publish official styles or change them.
        $this->postJson('/api/v1/line-styles', ['name' => 'Mine', 'look' => self::look(), 'official' => true])->assertForbidden();
        $this->patchJson("/api/v1/line-styles/{$free['id']}", ['name' => 'Hacked'])->assertForbidden();

        $this->onPlan($user, 'cartographer');
        $this->getJson('/api/v1/line-styles')->assertJsonFragment(['id' => $paid['id'], 'locked' => false]);

        $this->actingAs($admin)->patchJson("/api/v1/line-styles/{$paid['id']}", ['tier' => 2, 'published' => false])->assertOk()
            ->assertJsonPath('data.tier', 2)->assertJsonPath('data.published', false);
        $this->assertSame(3, LineStyle::query()->whereNull('owner_id')->count());
    }
}
