<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Models\ContentControl;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Showing and hiding the art that ships inside the web app (built-in
 * stamps, line art, styles, textures, templates). The art stays in the
 * app's code; hiding only takes it out of the editor's catalogs, so maps
 * that already use it are never broken. Audited.
 */
class ContentControlController extends AdminController
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => ['hidden' => ContentControl::hidden()]]);
    }

    /** Hides or shows one or many items of one kind. */
    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'kind' => ['required', Rule::in(ContentControl::KINDS)],
            'keys' => ['required', 'array', 'min:1', 'max:500'],
            'keys.*' => ['string', 'max:120', 'regex:/^[\w:.\-]+$/', 'distinct'],
            'hidden' => ['required', 'boolean'],
        ]);
        $kind = $data['kind'];
        $keys = array_values($data['keys']);

        if ($data['hidden']) {
            $now = now();
            ContentControl::query()->upsert(
                array_map(fn (string $key) => [
                    'kind' => $kind,
                    'key' => $key,
                    'hidden' => true,
                    'updated_by' => $request->user()->id,
                    'created_at' => $now,
                    'updated_at' => $now,
                ], $keys),
                ['kind', 'key'],
                ['hidden', 'updated_by', 'updated_at'],
            );
        } else {
            ContentControl::query()->where('kind', $kind)->whereIn('key', $keys)->delete();
        }
        ContentControl::forget();

        $this->audit()->log(
            $data['hidden'] ? 'content.builtin.hidden' : 'content.builtin.shown',
            'content_control',
            meta: ['kind' => $kind, 'keys' => $keys],
        );

        return response()->json(['data' => ['hidden' => ContentControl::hidden()]]);
    }
}
