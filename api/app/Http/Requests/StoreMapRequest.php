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
            ...$this->documentRules(true),
        ];
    }
}
