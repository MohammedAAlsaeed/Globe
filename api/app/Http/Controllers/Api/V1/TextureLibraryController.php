<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\AssetKind;
use App\Http\Controllers\Controller;
use App\Models\Asset;
use App\Models\AssetPack;
use App\Models\Plan;
use App\Models\User;
use App\Services\Entitlements;
use App\Services\FileUrls;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;

/**
 * The texture catalog in one answer: every texture pack the person can see
 * and every texture in it, as metadata and small previews — never the full
 * pictures, which the editor downloads only when a texture is used.
 *
 * Public: a guest sees the published official library at the default plan.
 * Signed in: plus their own uploads ("Me"); admins also see drafts. Packs
 * above the plan are listed as locked: their textures show a preview but
 * no picture to draw with.
 */
class TextureLibraryController extends Controller
{
    public function __construct(private Entitlements $entitlements) {}

    public function __invoke(FileUrls $urls): JsonResponse
    {
        $user = $this->user();
        $tier = $user?->isAdmin() ? PHP_INT_MAX : ($user ? $this->entitlements->plan($user)->tier : Plan::default()->tier);

        $packs = AssetPack::query()
            ->where('kind', AssetKind::Textures->value)
            ->where(function (Builder $q) use ($user) {
                $q->where(fn (Builder $o) => $o->whereNull('owner_id')->when(
                    ! $user?->isAdmin(),
                    fn (Builder $p) => $p->where('published', true),
                ));
                if ($user) {
                    $q->orWhere('owner_id', $user->id);
                }
            })
            ->orderByRaw('owner_id is not null')
            ->orderBy('sort')
            ->orderBy('name')
            ->get();

        $locked = [];
        foreach ($packs as $pack) {
            $locked[$pack->id] = $pack->owner_id === null && $pack->tier > $tier;
        }
        $assets = Asset::query()
            ->whereIn('pack_id', $packs->pluck('id'))
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => [
                'packs' => $packs->map(fn (AssetPack $p) => [
                    'id' => $p->id,
                    'name' => $p->name,
                    'style' => $p->style,
                    'official' => $p->isOfficial(),
                    'mine' => $user !== null && $p->owner_id === $user->id,
                    'tier' => $p->tier,
                    'published' => $p->published,
                    'locked' => $locked[$p->id],
                    'created_at' => $p->created_at,
                ])->all(),
                'textures' => $assets->map(fn (Asset $a) => [
                    'id' => $a->id,
                    'pack_id' => $a->pack_id,
                    'name' => $a->name,
                    'category' => $a->category,
                    'tags' => $a->tags ?? [],
                    'width' => $a->width,
                    'height' => $a->height,
                    'color' => $a->color,
                    'meta' => $a->meta ?? (object) [],
                    'thumb_url' => $urls->temporary($a->disk, $a->thumb_path ?? $a->path),
                    // Locked: a preview only, nothing to draw with.
                    'url' => $locked[$a->pack_id] ? null : $urls->temporary($a->disk, $a->path),
                    'created_at' => $a->created_at,
                ])->all(),
            ],
        ]);
    }

    /** The signed-in person, if any (this route doesn't require one). */
    private function user(): ?User
    {
        $user = auth('sanctum')->user();

        return $user instanceof User ? $user : null;
    }
}
