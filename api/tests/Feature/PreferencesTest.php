<?php

namespace Tests\Feature;

use App\Models\User;
use Tests\TestCase;

class PreferencesTest extends TestCase
{
    private static function controls(array $override = []): array
    {
        return array_replace_recursive([
            'wheel' => 'trackpad', 'zoomSpeed' => 1.5, 'invertZoom' => false, 'zoomToCursor' => true, 'smoothZoom' => true,
            'ctrlWheel' => 'rotate', 'middleButton' => 'pan', 'spacePan' => true, 'panStep' => 120, 'rotateStep' => 15,
            'touch' => ['fingerDraws' => false, 'pinchZoom' => true, 'longPress' => true, 'longPressMs' => 600],
            'pen' => ['pressure' => true, 'curve' => 'soft', 'palmRejection' => true, 'sideButton' => 'menu'],
        ], $override);
    }

    public function test_guests_have_no_preferences(): void
    {
        $this->getJson('/api/v1/auth/me/preferences')->assertUnauthorized();
        $this->putJson('/api/v1/auth/me/preferences', [])->assertUnauthorized();
    }

    public function test_preferences_follow_the_account(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->getJson('/api/v1/auth/me/preferences')->assertOk()
            ->assertJsonPath('data.controls', null)
            ->assertJsonPath('data.updated_at', 0);

        $this->putJson('/api/v1/auth/me/preferences', [
            'controls' => self::controls(['somethingNew' => 1]),
            'shortcuts' => ['tool.line' => ['KeyI'], 'view.hand' => []],
            'updated_at' => 1792800000000,
        ])->assertOk()
            ->assertJsonPath('data.controls.wheel', 'trackpad')
            ->assertJsonPath('data.controls.pen.curve', 'soft')
            ->assertJsonMissingPath('data.controls.somethingNew');

        $back = $this->getJson('/api/v1/auth/me/preferences')
            ->assertJsonPath('data.controls.touch.longPressMs', 600)
            ->assertJsonPath('data.updated_at', 1792800000000)
            ->json('data.shortcuts');
        $this->assertSame(['tool.line' => ['KeyI'], 'view.hand' => []], $back);
    }

    public function test_empty_settings_come_back_as_objects(): void
    {
        $user = User::factory()->create();
        $raw = $this->actingAs($user)->putJson('/api/v1/auth/me/preferences', [
            'controls' => ['touch' => new \stdClass],
            'shortcuts' => new \stdClass,
            'updated_at' => 1,
        ])->assertOk()->getContent();
        $this->assertStringContainsString('"shortcuts":{}', $raw);
        $this->assertStringContainsString('"touch":{}', $raw);
    }

    public function test_wrong_values_are_refused(): void
    {
        $user = User::factory()->create();
        $put = fn (array $body) => $this->actingAs($user)->putJson('/api/v1/auth/me/preferences', $body + ['updated_at' => 1]);
        foreach ([
            'wheel' => ['controls' => self::controls(['wheel' => 'joystick']), 'shortcuts' => []],
            'zoom speed' => ['controls' => self::controls(['zoomSpeed' => 50]), 'shortcuts' => []],
            'bool' => ['controls' => self::controls(['pen' => ['pressure' => 'yes']]), 'shortcuts' => []],
            'list' => ['controls' => [1, 2], 'shortcuts' => []],
            'action' => ['controls' => [], 'shortcuts' => ['<script>' => ['KeyA']]],
            'key' => ['controls' => [], 'shortcuts' => ['tool.line' => ['Ctrl+<b>']]],
            'too many keys' => ['controls' => [], 'shortcuts' => ['tool.line' => array_fill(0, 7, 'KeyA')]],
        ] as $why => $body) {
            $put($body)->assertUnprocessable();
        }
        $this->getJson('/api/v1/auth/me/preferences')->assertJsonPath('data.controls', null);
    }
}
