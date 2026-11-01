<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\InputBag;
use Symfony\Component\HttpFoundation\Response;

/**
 * Accepts request bodies sent gzip-compressed (`Content-Encoding: gzip`):
 * the editor compresses a map before saving it, a fraction of its size on
 * the way from the visitor to the server. The body is expanded here, before
 * anything reads it, with a ceiling so a small upload can't expand into an
 * enormous one.
 *
 * Every response says so (`Accept-Encoding: gzip`, RFC 7694): the web app
 * compresses only once it has seen that, so a web app deployed ahead of
 * this API never sends what the API can't read.
 */
class DecompressRequest
{
    public function handle(Request $request, Closure $next): Response
    {
        $encoding = strtolower(trim((string) $request->header('Content-Encoding')));
        if ($encoding !== '' && $encoding !== 'identity') {
            $this->expand($request, $encoding);
        }

        $response = $next($request);
        $response->headers->set('Accept-Encoding', 'gzip');

        return $response;
    }

    private function expand(Request $request, string $encoding): void
    {
        if ($encoding !== 'gzip') {
            throw new ApiException('unsupported_encoding', 'Only gzip request bodies are accepted.', 415);
        }

        $limit = (int) config('idrisi.maps.max_document_bytes') + 1024 * 1024;
        $body = @gzdecode($request->getContent(), $limit + 1);
        if ($body === false) {
            throw new ApiException('bad_encoding', 'The request body is not valid gzip, or too large once expanded.', 400);
        }
        if (strlen($body) > $limit) {
            throw new ApiException('too_large', 'The request body is too large.', 413);
        }

        $server = $request->server->all();
        unset($server['HTTP_CONTENT_ENCODING']);
        $server['CONTENT_LENGTH'] = (string) strlen($body);
        $request->initialize(
            $request->query->all(),
            [],
            $request->attributes->all(),
            $request->cookies->all(),
            $request->files->all(),
            $server,
            $body,
        );
        if ($request->isJson()) {
            $request->setJson(new InputBag((array) json_decode($body, true)));
        }
    }
}
