<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Route;
use RuntimeException;
use Tests\TestCase;

class SystemTest extends TestCase
{
    public function test_status_says_the_api_is_up(): void
    {
        $this->getJson('/api/v1/status')->assertOk()->assertJsonPath('status', 'ok');
    }

    public function test_maintenance_answers_503_with_a_code_and_a_retry_time(): void
    {
        $this->artisan('down', ['--retry' => 120])->assertSuccessful();
        try {
            $this->getJson('/api/v1/status')
                ->assertStatus(503)
                ->assertJsonPath('code', 'maintenance')
                ->assertJsonPath('retry_after', 120)
                ->assertHeader('Retry-After', '120');
            $this->getJson('/api/v1/plans')->assertStatus(503)->assertJsonPath('code', 'maintenance');
        } finally {
            $this->artisan('up');
        }
        $this->getJson('/api/v1/status')->assertOk();
    }

    public function test_http_errors_have_stable_codes(): void
    {
        $this->getJson('/api/v1/no-such-thing')->assertNotFound()
            ->assertJsonPath('code', 'not_found')->assertJsonPath('message', 'Not found.');

        // A model that doesn't exist doesn't name the model class.
        $user = User::factory()->create();
        $res = $this->actingAs($user)->getJson('/api/v1/maps/01nosuchmapnosuchmapnosuch')->assertNotFound();
        $this->assertSame('not_found', $res->json('code'));
        $this->assertStringNotContainsString('App\\Models', $res->getContent());

        $this->deleteJson('/api/v1/plans')->assertStatus(405)->assertJsonPath('code', 'method_not_allowed');
    }

    public function test_server_errors_show_a_reference_that_is_in_the_log(): void
    {
        config(['app.debug' => false]);
        Route::middleware('api')->get('api/v1/test-boom', fn () => throw new RuntimeException('secret detail'));
        Log::spy();

        $res = $this->getJson('/api/v1/test-boom')->assertStatus(500)->assertJsonPath('code', 'server_error');
        $reference = $res->json('reference');
        $this->assertMatchesRegularExpression('/^[0-9A-Z]{10}$/', $reference);
        $this->assertStringNotContainsString('secret detail', $res->getContent());

        Log::shouldHaveReceived('error')->withArgs(
            fn ($message, $context = []) => $message === 'secret detail' && ($context['reference'] ?? null) === $reference,
        );
    }

    public function test_browser_errors_are_logged_without_query_strings(): void
    {
        Log::spy();
        $this->postJson('/api/v1/client-errors', [
            'kind' => 'render',
            'message' => 'Cannot read properties of undefined',
            'stack' => "TypeError: ...\n    at Editor (editor.js:1:2)",
            'digest' => '12345',
            'url' => 'https://idrisi.win/reset-password?token=secret-token&email=a@b.c',
        ])->assertNoContent();

        Log::shouldHaveReceived('warning')->withArgs(
            fn ($message, $context = []) => $message === 'Web app error: Cannot read properties of undefined'
                && $context['path'] === '/reset-password'
                && $context['kind'] === 'render'
                && ! str_contains(json_encode($context), 'secret-token'),
        );
    }

    public function test_browser_error_reports_are_checked_and_limited(): void
    {
        $this->postJson('/api/v1/client-errors', ['kind' => 'nope', 'message' => 'x'])
            ->assertUnprocessable()->assertJsonValidationErrors(['kind']);
        $this->postJson('/api/v1/client-errors', ['kind' => 'window', 'message' => str_repeat('x', 1001)])
            ->assertUnprocessable()->assertJsonValidationErrors(['message']);

        // 20 a minute, the two rejected ones above included.
        foreach (range(1, 18) as $_) {
            $this->postJson('/api/v1/client-errors', ['kind' => 'window', 'message' => 'x'])->assertNoContent();
        }
        $this->postJson('/api/v1/client-errors', ['kind' => 'window', 'message' => 'x'])
            ->assertStatus(429)->assertJsonPath('code', 'too_many_requests');
    }
}
