<?php

namespace App\Http\Requests;

use App\Support\LineRules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * A request carrying a map document. The document is taken from the raw
 * body and re-encoded from objects (not PHP arrays), so it is stored exactly
 * as the editor sent it — an empty `{}` stays an object.
 *
 * Its outline is checked here, plus every Line Tool line (see LineRules —
 * lines are drawn by measuring them, so broken ones are refused up front);
 * the rest is the user's own data, which the editor validates fully when it
 * loads it.
 */
abstract class MapDocumentRequest extends FormRequest
{
    private ?string $documentJson = null;

    protected function documentRules(bool $required): array
    {
        return [
            'document' => [$required ? 'required' : 'sometimes', 'array'],
            'document.layers' => ['present', 'array', 'max:40'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator) {
            if (! $this->has('document')) {
                return;
            }
            $raw = json_decode($this->getContent(), false, 512, JSON_BIGINT_AS_STRING);
            $json = json_encode(
                $raw->document ?? null,
                JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION,
            );
            if ($json === false || ! is_object($raw->document ?? null)) {
                $validator->errors()->add('document', 'The document must be a JSON object.');

                return;
            }
            if (strlen($json) > config('idrisi.maps.max_document_bytes')) {
                $validator->errors()->add('document', 'The map document is too large.');

                return;
            }
            if (($error = LineRules::documentError($this->input('document'))) !== null) {
                $validator->errors()->add('document', $error);

                return;
            }
            $this->documentJson = $json;
        }];
    }

    /** The validated document as a JSON string (null when not sent). */
    public function documentJson(): ?string
    {
        return $this->documentJson;
    }
}
