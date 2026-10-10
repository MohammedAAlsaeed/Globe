<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\MapResource;
use App\Models\Map;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;

/** The small preview image shown in the map gallery. */
class MapThumbnailController extends Controller
{
    public function __invoke(Request $request, Map $map): MapResource
    {
        Gate::authorize('update', $map);
        $request->validate([
            'thumbnail' => ['required', 'image', 'mimes:png,webp,jpeg', 'max:'.config('idrisi.maps.max_thumbnail_kb')],
        ]);

        $disk = Storage::disk($map->disk);
        $old = $map->thumbnail_path;
        $path = $request->file('thumbnail')->storeAs(
            "maps/{$map->user_id}/{$map->id}",
            'thumb-'.now()->format('YmdHisv').'.'.$request->file('thumbnail')->extension(),
            $map->disk,
        );
        $map->forceFill(['thumbnail_path' => $path])->save();
        if ($old) {
            $disk->delete($old);
        }

        return new MapResource($map);
    }
}
