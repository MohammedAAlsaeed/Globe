<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Models\Map;
use App\Models\MapTemplate;
use App\Services\FileUrls;
use App\Services\TemplateFiles;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Official templates: staff draw a map in the editor, then publish a copy
 * of it here as a starting map for everyone. The copy is independent of
 * the map (later edits don't reach it until "update from map"). Removing a
 * template moves it to the trash for 30 days. Audited.
 */
class TemplateController extends AdminController
{
    public function index(FileUrls $urls): JsonResponse
    {
        $templates = MapTemplate::withTrashed()->orderBy('sort')->orderBy('name')->get();

        return response()->json(['data' => $templates->map(fn (MapTemplate $t) => $this->row($t, $urls))->all()]);
    }

    /** Makes a template (a draft) from one of the staff member's own maps. */
    public function store(Request $request, TemplateFiles $files, FileUrls $urls): JsonResponse
    {
        $data = $request->validate([
            'map_id' => ['required', 'string', 'size:26'],
            'name' => ['required', 'string', 'max:80'],
            'name_ar' => ['sometimes', 'nullable', 'string', 'max:80'],
            'tier' => ['sometimes', 'integer', 'between:0,9'],
        ]);
        $map = $this->ownMap($request, $data['map_id']);

        $template = new MapTemplate([
            'name' => $data['name'],
            'name_ar' => $data['name_ar'] ?? null,
            'tier' => $data['tier'] ?? 0,
            'published' => false,
        ]);
        // The id is needed for the paths before the row exists.
        $template->id = $template->newUniqueId();
        $template->created_by = $request->user()->id;
        $files->copyFromMap($template, $map);
        $template->save();
        $this->audit()->log('content.template.created', $template, null, $template->only(['name', 'name_ar', 'tier', 'published']), ['map' => $map->id]);

        return response()->json(['data' => $this->row($template, $urls)], 201);
    }

    /** Name, plan, publishing, order — and, with `map_id`, a fresh copy of that map. */
    public function update(Request $request, string $id, TemplateFiles $files, FileUrls $urls): JsonResponse
    {
        $template = MapTemplate::query()->findOrFail($id);
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:80'],
            'name_ar' => ['sometimes', 'nullable', 'string', 'max:80'],
            'tier' => ['sometimes', 'integer', 'between:0,9'],
            'published' => ['sometimes', 'boolean'],
            'sort' => ['sometimes', 'integer', 'between:0,65535'],
            'map_id' => ['sometimes', 'string', 'size:26'],
        ]);
        $fields = ['name', 'name_ar', 'tier', 'published', 'sort'];
        $before = $template->only($fields);
        $meta = [];
        if (isset($data['map_id'])) {
            $map = $this->ownMap($request, $data['map_id']);
            $files->copyFromMap($template, $map);
            $meta = ['map' => $map->id];
        }
        $template->fill(array_intersect_key($data, array_flip($fields)))->save();
        $this->audit()->log('content.template.updated', $template, $before, $template->only($fields), $meta);

        return response()->json(['data' => $this->row($template, $urls)]);
    }

    /** Moves a template to the trash (restorable for 30 days). */
    public function destroy(Request $request, string $id): Response
    {
        $template = MapTemplate::query()->findOrFail($id);
        $data = $request->validate(['reason' => ['sometimes', 'nullable', 'string', 'max:500']]);
        $template->forceFill([
            'removed_by' => $request->user()->id,
            'removed_reason' => $data['reason'] ?? null,
        ])->save();
        $template->delete();
        $this->audit()->log('content.template.trashed', $template, meta: array_filter(['reason' => $data['reason'] ?? null]));

        return response()->noContent();
    }

    public function restore(string $id): Response
    {
        $template = MapTemplate::onlyTrashed()->findOrFail($id);
        $template->restore();
        $template->forceFill(['removed_by' => null, 'removed_reason' => null])->save();
        $this->audit()->log('content.template.restored', $template);

        return response()->noContent();
    }

    /** Templates are made from the staff member's own maps only: nobody else's map is read here. */
    private function ownMap(Request $request, string $id): Map
    {
        return Map::query()->where('user_id', $request->user()->id)->findOrFail($id);
    }

    /** @return array<string, mixed> */
    private function row(MapTemplate $t, FileUrls $urls): array
    {
        return [
            'id' => $t->id,
            'name' => $t->name,
            'name_ar' => $t->name_ar,
            'width' => $t->width,
            'height' => $t->height,
            'bytes' => $t->document_bytes,
            'tier' => $t->tier,
            'published' => $t->published,
            'sort' => $t->sort,
            'thumbnail_url' => $urls->temporary($t->disk, $t->thumbnail_path),
            'created_at' => $t->created_at,
            'updated_at' => $t->updated_at,
            'deleted_at' => $t->deleted_at,
            'purge_at' => $t->deleted_at?->copy()->addDays(ContentModerationController::TRASH_DAYS),
            'removed_reason' => $t->removed_reason,
        ];
    }
}
