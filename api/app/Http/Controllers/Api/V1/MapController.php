<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreMapRequest;
use App\Http\Requests\UpdateMapRequest;
use App\Http\Resources\MapResource;
use App\Models\Map;
use App\Services\Entitlements;
use App\Services\MapDocuments;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

/** The signed-in user's maps. */
class MapController extends Controller
{
    public function __construct(
        private MapDocuments $documents,
        private Entitlements $entitlements,
    ) {}

    /** Newest first, with how many more the plan allows. */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $maps = $user->maps()->latest('updated_at')->get();

        return response()->json([
            'data' => MapResource::collection($maps),
            'limits' => [
                'count' => $maps->count(),
                'max' => $this->entitlements->plan($user)->max_maps,
            ],
        ]);
    }

    public function store(StoreMapRequest $request): JsonResponse
    {
        $user = $request->user();
        $this->entitlements->ensureCanCreateMap($user);

        $map = $this->documents->create(
            $user,
            $request->safe()->only(['name', 'width', 'height', 'schema_version']),
            $request->documentJson(),
        );

        return (new MapResource($map))->response()->setStatusCode(201);
    }

    /** Metadata plus the document, streamed as stored (no decode/re-encode). */
    public function show(Map $map): Response
    {
        Gate::authorize('view', $map);
        $meta = json_encode(new MapResource($map), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        return response('{"data":'.$meta.',"document":'.$this->documents->read($map).'}', 200, [
            'Content-Type' => 'application/json',
        ]);
    }

    public function update(UpdateMapRequest $request, Map $map): MapResource
    {
        Gate::authorize('update', $map);
        if ((int) $request->validated('revision') !== $map->revision) {
            throw ApiException::revisionConflict($map->revision);
        }
        $map = $this->documents->update(
            $map,
            $request->documentJson(),
            $request->safe()->only(['name', 'width', 'height', 'schema_version']),
        );

        return new MapResource($map);
    }

    /** Renames a map without touching its document. */
    public function rename(Request $request, Map $map): MapResource
    {
        Gate::authorize('update', $map);
        $map->update($request->validate(['name' => ['required', 'string', 'max:120']]));

        return new MapResource($map);
    }

    /** Moves a map to the trash (purged later; see maps:purge-trashed). */
    public function destroy(Map $map): Response
    {
        Gate::authorize('delete', $map);
        $map->delete();

        return response()->noContent();
    }
}
