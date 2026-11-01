<?php

namespace App\Http\Requests;

class StoreMapRequest extends MapDocumentRequest
{
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'width' => ['required', 'integer', 'between:64,20000'],
            'height' => ['required', 'integer', 'between:64,20000'],
            'schema_version' => ['sometimes', 'integer', 'between:1,1000'],
            // The editor's id for this save: a retry of a save already made is answered with it.
            'save_id' => ['sometimes', 'string', 'max:40', 'regex:/^[A-Za-z0-9_-]+$/'],
            ...$this->documentRules(true),
        ];
    }
}
