<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * A domain error the client is expected to handle: rendered as
 * `{ "message": ..., "code": ..., ...context }` with its HTTP status, so the
 * web app can react to (and translate) the stable `code`.
 */
class ApiException extends RuntimeException
{
    /** @param array<string, mixed> $context */
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly int $status = 422,
        public readonly array $context = [],
    ) {
        parent::__construct($message);
    }

    public static function planLimit(string $what, int|null $limit): self
    {
        return new self('plan_limit_reached', "Your plan's {$what} limit has been reached.", 403, [
            'limit' => $what,
            'max' => $limit,
        ]);
    }

    public static function revisionConflict(int $current): self
    {
        return new self('revision_conflict', 'The map was changed elsewhere; reload it before saving.', 409, [
            'current_revision' => $current,
        ]);
    }

    public function render(): JsonResponse
    {
        return response()->json(
            ['message' => $this->getMessage(), 'code' => $this->errorCode] + $this->context,
            $this->status,
        );
    }
}
