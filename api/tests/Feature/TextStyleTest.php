<?php

namespace Tests\Feature;

use App\Enums\Role;
use App\Models\TextStyle;
use App\Models\User;
use Tests\TestCase;

class TextStyleTest extends TestCase
{
    /** A look exactly as the Text Tool saves it. */
    public static function look(array $override = []): array
    {
        return array_replace_recursive([
            'profile' => 'royal-kingdom', 'font' => null, 'size' => 0.05, 'weight' => 600, 'italic' => false, 'caps' => true,
            'letterSpacing' => 0.18, 'wordSpacing' => 0, 'lineHeight' => 1.2, 'align' => 'center', 'direction' => 'auto', 'lang' => '',
            'features' => ['dlig' => true], 'kashida' => 0, 'fill' => '#5a1f12', 'fillOpacity' => 1, 'opacity' => 1,
            'outline' => ['enabled' => true, 'color' => '#f3e7c9', 'width' => 0.06, 'opacity' => 0.7, 'join' => 'round', 'position' => 'outside'],
            'shadow' => ['enabled' => true, 'color' => '#000000', 'opacity' => 0.3, 'blur' => 0.18, 'offsetX' => 0.04, 'offsetY' => 0.06],
            'curveMode' => 'arc', 'curve' => 16, 'letters' => 'auto',
        ], $override);
    }

    public function test_people_save_list_and_delete_their_own_text_styles(): void
    {
        $user = User::factory()->create();
        $created = $this->actingAs($user)->postJson('/api/v1/text-styles', ['name' => 'Capitals', 'look' => self::look()])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Capitals')
            ->assertJsonPath('data.official', false)
            ->assertJsonPath('data.look.profile', 'royal-kingdom')
            ->assertJsonPath('data.look.features.dlig', true)
            ->json('data');

        $this->getJson('/api/v1/text-styles')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('limits', ['count' => 1, 'max' => 10]);
        $this->getJson('/api/v1/auth/me')->assertJsonPath('data.usage.text_styles', 1)
            ->assertJsonPath('data.plan.max_text_styles', 10);

        $other = User::factory()->create();
        $this->actingAs($other)->getJson('/api/v1/text-styles')->assertJsonCount(0, 'data');
        $this->patchJson("/api/v1/text-styles/{$created['id']}", ['name' => 'Mine'])->assertForbidden();
        $this->deleteJson("/api/v1/text-styles/{$created['id']}")->assertForbidden();

        $this->actingAs($user)->patchJson("/api/v1/text-styles/{$created['id']}", ['name' => 'Capital cities'])->assertOk()
            ->assertJsonPath('data.name', 'Capital cities');
        $this->deleteJson("/api/v1/text-styles/{$created['id']}")->assertNoContent();
        $this->assertDatabaseCount('text_styles', 0);
    }

    public function test_a_look_comes_back_as_the_editor_sent_it(): void
    {
        // Requests turn "" into null, and PHP can't tell {} from []: the
        // editor must get back an empty language and an empty features object.
        $user = User::factory()->create();
        $this->actingAs($user)->postJson('/api/v1/text-styles', ['name' => 'Plain', 'look' => self::look(['lang' => '', 'features' => new \stdClass])])
            ->assertCreated()
            ->assertJsonPath('data.look.lang', '');
        $raw = $this->getJson('/api/v1/text-styles')->assertOk()->getContent();
        $this->assertStringContainsString('"features":{}', $raw);
        $this->assertStringContainsString('"lang":""', $raw);
    }

    public function test_the_plan_caps_text_styles_and_a_downgrade_deletes_nothing(): void
    {
        $user = User::factory()->create();
        for ($i = 0; $i < 10; $i++) {
            $this->actingAs($user)->postJson('/api/v1/text-styles', ['name' => "S{$i}", 'look' => self::look()])->assertCreated();
        }
        $this->postJson('/api/v1/text-styles', ['name' => 'One more', 'look' => self::look()])
            ->assertForbidden()
            ->assertJsonPath('code', 'plan_limit_reached')
            ->assertJsonPath('limit', 'text_styles')
            ->assertJsonPath('max', 10)
            ->assertJsonPath('plan', 'explorer');

        $this->onPlan($user, 'cartographer');
        $this->postJson('/api/v1/text-styles', ['name' => 'Eleven', 'look' => self::look()])->assertCreated();
        $user->subscriptions()->update(['ends_at' => now()->subSecond()]);
        $this->getJson('/api/v1/text-styles')->assertJsonCount(11, 'data')->assertJsonPath('limits', ['count' => 11, 'max' => 10]);
        // Line styles have their own limit: text styles don't use it up.
        $this->postJson('/api/v1/line-styles', ['name' => 'Road', 'look' => LineStyleTest::look()])->assertCreated();
    }

    public function test_text_looks_are_validated_like_the_editor_does(): void
    {
        $user = User::factory()->create();
        $bad = [
            'profile' => self::look(['profile' => '../../etc']),
            'font' => self::look(['font' => 'Comic Sans MS']),
            'size' => self::look(['size' => 3]),
            'weight' => self::look(['weight' => 1000]),
            'align' => self::look(['align' => 'justify']),
            'direction' => self::look(['direction' => 'ttb']),
            'lang' => self::look(['lang' => 'not a language']),
            'features' => self::look(['features' => ['<script>' => true]]),
            'feature value' => self::look(['features' => ['liga' => 'yes']]),
            'fill' => self::look(['fill' => 'red']),
            'outline join' => self::look(['outline' => ['join' => 'sharp']]),
            'shadow blur' => self::look(['shadow' => ['blur' => 9]]),
            'curve' => self::look(['curve' => 400]),
            'letters' => self::look(['letters' => 'scatter']),
            'blend' => self::look(['blend' => 'xor']),
        ];
        foreach ($bad as $why => $look) {
            $this->actingAs($user)->postJson('/api/v1/text-styles', ['name' => $why, 'look' => $look])
                ->assertUnprocessable()->assertJsonValidationErrors('look');
        }
        $this->postJson('/api/v1/text-styles', ['name' => 'ok', 'look' => self::look(['blend' => 'multiply', 'font' => 'amiri', 'lang' => 'ar-SA', 'features' => []])])
            ->assertCreated();
    }

    public function test_admins_publish_official_text_styles_locked_above_a_plan(): void
    {
        $admin = User::factory()->create();
        $admin->forceFill(['role' => Role::Admin])->save();
        $free = $this->asStaff($admin)->postJson('/api/v1/text-styles', ['name' => 'Atelier title', 'look' => self::look(), 'official' => true, 'published' => true])
            ->assertCreated()->json('data');
        $paid = $this->postJson('/api/v1/text-styles', ['name' => 'Gilded empire', 'look' => self::look(), 'official' => true, 'tier' => 1, 'published' => true])
            ->assertCreated()->json('data');

        $user = User::factory()->create();
        $this->actingAs($user)->getJson('/api/v1/text-styles')->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonFragment(['id' => $free['id'], 'locked' => false])
            ->assertJsonFragment(['id' => $paid['id'], 'locked' => true, 'look' => null])
            ->assertJsonPath('limits.count', 0);
        $this->postJson('/api/v1/text-styles', ['name' => 'Mine', 'look' => self::look(), 'official' => true])->assertForbidden();

        $this->onPlan($user, 'cartographer');
        $this->getJson('/api/v1/text-styles')->assertJsonFragment(['id' => $paid['id'], 'locked' => false]);
        $this->assertSame(2, TextStyle::query()->whereNull('owner_id')->count());
    }

    public function test_the_plans_list_their_text_style_limits(): void
    {
        $this->getJson('/api/v1/plans')->assertOk()
            ->assertJsonPath('data.0.max_text_styles', 10)
            ->assertJsonPath('data.1.max_text_styles', 200)
            ->assertJsonPath('data.2.max_text_styles', null);
    }
}
