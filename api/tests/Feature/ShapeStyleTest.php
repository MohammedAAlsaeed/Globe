<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\ShapeStyle;
use App\Models\User;
use Tests\TestCase;

class ShapeStyleTest extends TestCase
{
    /** A look exactly as the Shape Tool saves it (a stone room). */
    public static function look(array $override = []): array
    {
        $line = LineStyleTest::look();

        return array_replace_recursive([
            'stroke' => ['mode' => 'stamp', 'color' => $line['stroke'], 'stamp' => $line['stamp'], 'align' => 'inside', 'opacity' => 1],
            'fill' => [
                'type' => 'texture',
                'source' => [
                    'type' => 'texture', 'color' => '#cdb98f', 'texture' => 'flagstone', 'textureScale' => 0.6, 'textureRotation' => 0,
                    'hue' => 0, 'saturation' => 0, 'brightness' => 0, 'contrast' => 0,
                ],
                'pattern' => 'forest', 'opacity' => 1, 'anchor' => 'shape', 'invert' => false, 'feather' => 0,
            ],
            'opacity' => 1,
        ], $override);
    }

    /** A shape object as the editor saves it in a map: a room with a hole and a door. */
    public static function shape(array $override = []): array
    {
        $rect = [['x' => 0.3, 'y' => 0.4], ['x' => 0.7, 'y' => 0.4], ['x' => 0.7, 'y' => 0.6], ['x' => 0.3, 'y' => 0.6]];
        $ellipse = [
            ['x' => 0.5, 'y' => 0.45, 't' => 'smooth', 'hi' => ['x' => -0.03, 'y' => 0], 'ho' => ['x' => 0.03, 'y' => 0]],
            ['x' => 0.55, 'y' => 0.5, 't' => 'smooth', 'hi' => ['x' => 0, 'y' => -0.03], 'ho' => ['x' => 0, 'y' => 0.03]],
            ['x' => 0.5, 'y' => 0.55, 't' => 'smooth', 'hi' => ['x' => 0.03, 'y' => 0], 'ho' => ['x' => -0.03, 'y' => 0]],
            ['x' => 0.45, 'y' => 0.5, 't' => 'smooth', 'hi' => ['x' => 0, 'y' => 0.03], 'ho' => ['x' => 0, 'y' => -0.03]],
        ];

        return array_replace(self::look() + [
            'id' => 'shape-1', 'kind' => 'shape', 'name' => 'Great Hall', 'styleId' => 'p:stoneRoom',
            'parts' => [
                ['id' => 'a', 'op' => 'add', 'nodes' => $rect, 'prim' => ['kind' => 'rect', 'cx' => 0.5, 'cy' => 0.5, 'w' => 0.4, 'h' => 0.2, 'rot' => 0, 'radius' => 0]],
                ['id' => 'g', 'op' => 'subtract', 'parts' => [['id' => 'b', 'op' => 'add', 'nodes' => $ellipse]]],
            ],
            'portals' => [['id' => 'd1', 'part' => 'a', 'seg' => 0, 't' => 0.5, 'width' => 0.02]],
            'frame' => ['x' => 0.3, 'y' => 0.4, 'rot' => 0, 'scale' => 1],
        ], $override);
    }

    public function test_people_save_list_and_delete_their_own_shape_styles(): void
    {
        $user = User::factory()->create();
        $created = $this->actingAs($user)->postJson('/api/v1/shape-styles', ['name' => 'Keep', 'look' => self::look()])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Keep')
            ->assertJsonPath('data.official', false)
            ->assertJsonPath('data.look.stroke.align', 'inside')
            ->assertJsonPath('data.look.fill.source.texture', 'flagstone')
            ->json('data');

        $this->getJson('/api/v1/shape-styles')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('limits', ['count' => 1, 'max' => 10]);
        $this->getJson('/api/v1/auth/me')->assertJsonPath('data.usage.shape_styles', 1)
            ->assertJsonPath('data.plan.max_shape_styles', 10);

        $other = User::factory()->create();
        $this->actingAs($other)->getJson('/api/v1/shape-styles')->assertJsonCount(0, 'data');
        $this->patchJson("/api/v1/shape-styles/{$created['id']}", ['name' => 'Mine'])->assertForbidden();
        $this->deleteJson("/api/v1/shape-styles/{$created['id']}")->assertForbidden();

        $this->actingAs($user)->patchJson("/api/v1/shape-styles/{$created['id']}", ['name' => 'Castle keep'])->assertOk()
            ->assertJsonPath('data.name', 'Castle keep');
        $this->deleteJson("/api/v1/shape-styles/{$created['id']}")->assertNoContent();
        $this->assertDatabaseCount('shape_styles', 0);
    }

    public function test_the_plan_caps_shape_styles_and_a_downgrade_deletes_nothing(): void
    {
        $user = User::factory()->create();
        for ($i = 0; $i < 10; $i++) {
            $this->actingAs($user)->postJson('/api/v1/shape-styles', ['name' => "S{$i}", 'look' => self::look()])->assertCreated();
        }
        $this->postJson('/api/v1/shape-styles', ['name' => 'One more', 'look' => self::look()])
            ->assertForbidden()
            ->assertJsonPath('code', 'plan_limit_reached')
            ->assertJsonPath('limit', 'shape_styles')
            ->assertJsonPath('max', 10)
            ->assertJsonPath('plan', 'explorer');

        $this->onPlan($user, 'cartographer');
        $this->postJson('/api/v1/shape-styles', ['name' => 'Eleven', 'look' => self::look()])->assertCreated();
        $user->subscriptions()->update(['ends_at' => now()->subSecond()]);
        $this->getJson('/api/v1/shape-styles')->assertJsonCount(11, 'data')->assertJsonPath('limits', ['count' => 11, 'max' => 10]);
        // Text styles have their own limit: shape styles don't use it up.
        $this->postJson('/api/v1/text-styles', ['name' => 'Title', 'look' => TextStyleTest::look()])->assertCreated();
    }

    public function test_shape_looks_are_validated_like_the_editor_does(): void
    {
        $user = User::factory()->create();
        $bad = [
            'stroke mode' => self::look(['stroke' => ['mode' => 'glow']]),
            'align' => self::look(['stroke' => ['align' => 'left']]),
            'stroke opacity' => self::look(['stroke' => ['opacity' => 2]]),
            'wall art' => self::look(['stroke' => ['stamp' => ['parts' => ['seg' => ['../x']]]]]),
            'fill type' => self::look(['fill' => ['type' => 'gradient']]),
            'texture' => self::look(['fill' => ['source' => ['texture' => 'marble']]]),
            'pattern' => self::look(['fill' => ['pattern' => 'lava']]),
            'anchor' => self::look(['fill' => ['anchor' => 'screen']]),
            'feather' => self::look(['fill' => ['feather' => 1]]),
            'invert' => self::look(['fill' => ['invert' => 'yes']]),
            'opacity' => self::look(['opacity' => -0.1]),
            'blend' => self::look(['blend' => 'xor']),
        ];
        foreach ($bad as $why => $look) {
            $this->actingAs($user)->postJson('/api/v1/shape-styles', ['name' => $why, 'look' => $look])
                ->assertUnprocessable()->assertJsonValidationErrors('look');
        }
        $mask = self::look(['stroke' => ['mode' => 'none'], 'fill' => ['type' => 'mask', 'invert' => true, 'feather' => 0.004], 'blend' => 'multiply']);
        $this->postJson('/api/v1/shape-styles', ['name' => 'Fog', 'look' => $mask])->assertCreated();
    }

    public function test_admins_publish_official_shape_styles_locked_above_a_plan(): void
    {
        $admin = User::factory()->create();
        $admin->forceFill(['role' => Role::Admin])->save();
        $free = $this->actingAs($admin)->postJson('/api/v1/shape-styles', ['name' => 'Atelier room', 'look' => self::look(), 'official' => true, 'published' => true])
            ->assertCreated()->json('data');
        $paid = $this->postJson('/api/v1/shape-styles', ['name' => 'Royal keep', 'look' => self::look(), 'official' => true, 'tier' => 1, 'published' => true])
            ->assertCreated()->json('data');

        $user = User::factory()->create();
        $this->actingAs($user)->getJson('/api/v1/shape-styles')->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonFragment(['id' => $free['id'], 'locked' => false])
            ->assertJsonFragment(['id' => $paid['id'], 'locked' => true, 'look' => null])
            ->assertJsonPath('limits.count', 0);
        $this->postJson('/api/v1/shape-styles', ['name' => 'Mine', 'look' => self::look(), 'official' => true])->assertForbidden();

        $this->onPlan($user, 'cartographer');
        $this->getJson('/api/v1/shape-styles')->assertJsonFragment(['id' => $paid['id'], 'locked' => false]);
        $this->assertSame(2, ShapeStyle::query()->whereNull('owner_id')->count());
    }

    public function test_the_plans_list_their_shape_style_limits(): void
    {
        $this->getJson('/api/v1/plans')->assertOk()
            ->assertJsonPath('data.0.max_shape_styles', 10)
            ->assertJsonPath('data.1.max_shape_styles', 200)
            ->assertJsonPath('data.2.max_shape_styles', null);
    }
}
