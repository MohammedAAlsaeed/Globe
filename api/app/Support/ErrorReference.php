<?php

namespace App\Support;

use Illuminate\Support\Str;

/**
 * A short code that ties what a person sees after a server error ("reference
 * 7K2M9QX4PA") to the log entry of that error: one per request, made on first
 * use.
 */
final class ErrorReference
{
    public static function current(): string
    {
        $request = request();
        $reference = $request->attributes->get('error_reference');
        if (! is_string($reference)) {
            $reference = substr((string) Str::ulid(), -10);
            $request->attributes->set('error_reference', $reference);
        }

        return $reference;
    }
}
