<?php

namespace App\Http\Requests;

/**
 * Saves a map. `revision` is the revision the editor started from: a save
 * based on an older one is refused (409) instead of overwriting newer work.
 */
class UpdateMapRequest extends MapDocumentRequest
{
    public function rules(): array
    {
        return [
            'revision' => ['required', 'integer', 'min:1'],
            'name' => ['sometimes', 'string', 'max:120'],
            'width' => ['sometimes', 'integer', 'between:64,20000'],
            'height' => ['sometimes', 'integer', 'between:64,20000'],
            'schema_version' => ['sometimes', 'integer', 'between:1,1000'],
            ...$this->documentRules(true),
        ];
    }
}
