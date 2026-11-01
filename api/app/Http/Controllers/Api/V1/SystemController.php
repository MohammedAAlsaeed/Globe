<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

/**
 * The service's own state, for the web app: is the API up (or in maintenance,
 * which answers 503 before reaching here), and where errors seen in visitors'
 * browsers are reported, so they land in the same logs as the server's.
 */
class SystemController extends Controller
{
    /** Cheap on purpose: no database, no session. */
    public function status(): JsonResponse
    {
        return response()->json(['status' => 'ok', 'time' => now()->toIso8601String()])
            ->header('Cache-Control', 'no-store');
    }

    public function clientError(Request $request): Response
    {
        $data = $request->validate([
            'kind' => ['required', Rule::in(['render', 'global', 'window', 'promise'])],
            'message' => ['required', 'string', 'max:1000'],
            'stack' => ['nullable', 'string', 'max:8000'],
            'digest' => ['nullable', 'string', 'max:64'],
            'url' => ['nullable', 'string', 'max:2000'],
            'release' => ['nullable', 'string', 'max:64'],
        ]);

        Log::warning('Web app error: '.$data['message'], [
            'kind' => $data['kind'],
            // The page only: query strings can carry tokens (password resets).
            'path' => $this->pathOf($data['url'] ?? null),
            'digest' => $data['digest'] ?? null,
            'release' => $data['release'] ?? null,
            'stack' => $data['stack'] ?? null,
            'user_id' => $request->user('sanctum')?->id,
            'user_agent' => mb_substr((string) $request->userAgent(), 0, 300),
        ]);

        return response()->noContent();
    }

    private function pathOf(?string $url): ?string
    {
        if ($url === null) {
            return null;
        }
        $path = parse_url($url, PHP_URL_PATH);

        return is_string($path) ? mb_substr($path, 0, 300) : null;
    }
}
