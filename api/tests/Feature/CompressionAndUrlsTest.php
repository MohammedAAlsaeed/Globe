<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\FileUrls;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class CompressionAndUrlsTest extends TestCase
{
    /** Sends a JSON body gzip-compressed, the way the editor saves maps. */
    private function gzipJson(string $method, string $uri, array|string $body, array $headers = [])
    {
        $raw = is_string($body) ? $body : json_encode($body, JSON_UNESCAPED_UNICODE);

        return $this->call($method, $uri, [], [], [], $this->transformHeadersToServerVars($headers + [
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
            'Content-Encoding' => 'gzip',
        ]), gzencode($raw, 6));
    }

    public function test_a_map_can_be_created_and_saved_with_a_gzip_body(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $doc = $this->document(['label' => 'مرسم الإدريسي', 'coast' => (object) []]);

        $map = $this->gzipJson('POST', '/api/v1/maps', [
            'name' => '  World  ', 'width' => 2048, 'height' => 1536, 'document' => $doc,
        ])->assertCreated()->assertJsonPath('data.revision', 1)->json('data');

        $this->gzipJson('PUT', "/api/v1/maps/{$map['id']}", [
            'revision' => 1, 'document' => $this->document(['label' => 'two']), 'save_id' => 'abc-1',
        ])->assertOk()->assertJsonPath('data.revision', 2);

        $res = $this->getJson("/api/v1/maps/{$map['id']}")->assertOk();
        $this->assertSame('two', $res->json('document.label'));
    }

    public function test_the_stored_document_matches_the_uncompressed_body_exactly(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $doc = $this->document(['coast' => (object) [], 'label' => 'مرسم']);

        $map = $this->gzipJson('POST', '/api/v1/maps', [
            'name' => 'World', 'width' => 640, 'height' => 480, 'document' => $doc,
        ])->assertCreated()->json('data');

        $body = $this->getJson("/api/v1/maps/{$map['id']}")->getContent();
        $this->assertStringContainsString('"coast":{}', $body);
        $this->assertStringContainsString('مرسم', $body);
    }

    public function test_broken_or_unknown_encodings_are_refused(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $this->call('POST', '/api/v1/maps', [], [], [], $this->transformHeadersToServerVars([
            'Content-Type' => 'application/json', 'Accept' => 'application/json', 'Content-Encoding' => 'gzip',
        ]), 'not gzip at all')->assertStatus(400)->assertJsonPath('code', 'bad_encoding');

        $this->call('POST', '/api/v1/maps', [], [], [], $this->transformHeadersToServerVars([
            'Content-Type' => 'application/json', 'Accept' => 'application/json', 'Content-Encoding' => 'br',
        ]), '{}')->assertStatus(415)->assertJsonPath('code', 'unsupported_encoding');
    }

    public function test_a_small_body_cannot_expand_past_the_limit(): void
    {
        config(['idrisi.maps.max_document_bytes' => 1024]);
        $user = User::factory()->create();
        $this->actingAs($user);

        // About 3 MiB of zeros: a few KiB compressed, over the 1 KiB + 1 MiB ceiling.
        $bomb = '{"name":"x","document":"'.str_repeat('0', 3 * 1024 * 1024).'"}';
        $res = $this->gzipJson('POST', '/api/v1/maps', $bomb);
        $this->assertContains($res->getStatusCode(), [400, 413]);
        $this->assertSame(0, $user->maps()->count());
    }

    public function test_plain_bodies_still_work_and_responses_offer_gzip(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->postJson('/api/v1/maps', [
            'name' => 'World', 'width' => 640, 'height' => 480, 'document' => $this->document(),
        ])->assertCreated()->assertHeader('Accept-Encoding', 'gzip');

        // Readable by the web app across origins.
        $this->getJson('/api/v1/plans', ['Origin' => 'http://localhost:3000'])
            ->assertHeader('Accept-Encoding', 'gzip')
            ->assertHeader('Access-Control-Expose-Headers', 'Accept-Encoding');
    }

    public function test_signed_urls_stay_the_same_within_a_window_and_say_how_to_cache(): void
    {
        config(['filesystems.disks.r2-test' => [
            'driver' => 's3',
            'key' => 'test-key',
            'secret' => 'test-secret',
            'region' => 'auto',
            'bucket' => 'idrisi-test',
            'endpoint' => 'https://example.r2.cloudflarestorage.com',
            'use_path_style_endpoint' => true,
        ]]);
        $urls = app(FileUrls::class);

        Carbon::setTestNow('2026-11-01 01:00:00');
        [$start] = FileUrls::window();
        $first = $urls->temporary('r2-test', 'maps/u/m/thumb-1.webp');

        // Later in the same window: the very same URL (the browser's cache hits).
        $this->travelTo(Carbon::createFromTimestamp($start + 11 * 3600));
        $this->assertSame($first, $urls->temporary('r2-test', 'maps/u/m/thumb-1.webp'));

        // The next window: a new signature, still valid for at least 12 hours.
        $this->travelTo(Carbon::createFromTimestamp($start + 12 * 3600 + 1));
        $next = $urls->temporary('r2-test', 'maps/u/m/thumb-1.webp');
        $this->assertNotSame($first, $next);

        parse_str(parse_url($first, PHP_URL_QUERY), $q);
        $this->assertSame(gmdate('Ymd\THis\Z', $start), $q['X-Amz-Date']);
        $this->assertSame((string) (24 * 3600), $q['X-Amz-Expires']);
        $this->assertSame(FileUrls::CACHE_CONTROL, $q['response-cache-control']);
        $this->assertStringContainsString('/idrisi-test/maps/u/m/thumb-1.webp', $first);

        // Different files, different URLs.
        $this->assertNotSame($next, $urls->temporary('r2-test', 'maps/u/m/thumb-2.webp'));
    }
}
