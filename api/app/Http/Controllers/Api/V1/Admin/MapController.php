<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Models\Map;
use App\Services\FileUrls;
use App\Services\MapDocuments;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

/**
 * Everyone's maps, for support and moderation. The list shows metadata and
 * thumbnails only; opening a map's document is a separate permission
 * (`maps.read`, the owner by default) and every opening is audited.
 */
class MapController extends AdminController
{
    public function index(Request $request, FileUrls $urls): JsonResponse
    {
        $f = $request->validate([
            'q' => ['sometimes', 'nullable', 'string', 'max:120'],
            'user' => ['sometimes', 'nullable', 'string', 'max:32'],
            'state' => ['sometimes', 'nullable', Rule::in(['live', 'trashed', 'all'])],
            'sort' => ['sometimes', 'nullable', Rule::in(['-updated_at', 'updated_at', '-document_bytes', '-created_at', 'name'])],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:5', 'max:100'],
        ]);
        $sort = $f['sort'] ?? '-updated_at';
        $page = Map::query()
            ->with('user:id,name,email')
            ->when(($f['state'] ?? 'live') === 'trashed', fn (Builder $q) => $q->onlyTrashed())
            ->when(($f['state'] ?? 'live') === 'all', fn (Builder $q) => $q->withTrashed())
            ->when($f['user'] ?? null, fn (Builder $q, string $id) => $q->where('user_id', $id))
            ->when($f['q'] ?? null, function (Builder $q, string $term) {
                $like = '%'.str_replace(['%', '_'], ['\%', '\_'], mb_strtolower($term)).'%';
                $q->where(fn ($o) => $o->whereRaw('lower(name) like ?', [$like])
                    ->orWhereHas('user', fn ($u) => $u->whereRaw('lower(email) like ?', [$like]))
                    ->orWhere('id', $term));
            })
            ->orderBy(ltrim($sort, '-'), str_starts_with($sort, '-') ? 'desc' : 'asc')
            ->orderBy('id')
            ->paginate($this->perPage($f['per_page'] ?? null));

        return response()->json([
            'data' => $page->getCollection()->map(fn (Map $m) => [
                'id' => $m->id,
                'name' => $m->name,
                'width' => $m->width,
                'height' => $m->height,
                'revision' => $m->revision,
                'bytes' => $m->document_bytes,
                'thumbnail_url' => $m->thumbnail_path ? $urls->temporary($m->disk, $m->thumbnail_path) : null,
                'user' => $m->user ? ['id' => $m->user->id, 'name' => $m->user->name, 'email' => $m->user->email] : null,
                'created_at' => $m->created_at,
                'updated_at' => $m->updated_at,
                'deleted_at' => $m->deleted_at,
            ])->all(),
            'meta' => ['total' => $page->total(), 'page' => $page->currentPage(), 'per_page' => $page->perPage(), 'last_page' => $page->lastPage()],
        ]);
    }

    /** Moves a map to the owner's trash (restorable). */
    public function destroy(Request $request, Map $map): Response
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:500']]);
        $map->delete();
        $this->audit()->log('map.trashed', $map, meta: ['owner' => $map->user_id, 'reason' => $data['reason']]);

        return response()->noContent();
    }

    public function restore(string $id): Response
    {
        $map = Map::onlyTrashed()->findOrFail($id);
        $map->restore();
        $this->audit()->log('map.restored', $map, meta: ['owner' => $map->user_id]);

        return response()->noContent();
    }

    /** The map's document, for investigating a problem report. Audited. */
    public function document(Request $request, string $id, MapDocuments $documents): Response
    {
        $map = Map::withTrashed()->findOrFail($id);
        $data = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:500']]);
        $this->audit()->log('map.document_read', $map, meta: ['owner' => $map->user_id, 'revision' => $map->revision, 'reason' => $data['reason']]);

        return response($documents->read($map), 200, [
            'Content-Type' => 'application/json',
            'Cache-Control' => 'no-store',
            'X-Map-Revision' => (string) $map->revision,
        ]);
    }
}
