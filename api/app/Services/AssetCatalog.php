<?php

namespace App\Services;

use App\Enums\AssetKind;
use App\Models\Asset;
use App\Models\AssetPack;
use App\Models\Plan;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * An editor catalog (stamps, textures) in one answer: every pack of a kind
 * the person can see and every asset in it, as metadata and small
 * previews — never the full pictures of locked packs.
 *
 * A guest sees the published official library at the default plan. Signed
 * in: plus their own uploads; admins also see drafts. Packs above the plan
 * are listed as locked: their assets show a preview, but nothing to draw.
 */
class AssetCatalog
{
    public function __construct(private Entitlements $entitlements, private FileUrls $urls) {}

    /** @return array{packs: Collection<int, AssetPack>, assets: Collection<int, Asset>, locked: array<string, bool>} */
    public function load(AssetKind $kind, ?User $user): array
    {
        $tier = $user?->isAdmin() ? PHP_INT_MAX : ($user ? $this->entitlements->plan($user)->tier : Plan::default()->tier);

        $packs = AssetPack::query()
            ->where('kind', $kind->value)
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

        return ['packs' => $packs, 'assets' => $assets, 'locked' => $locked];
    }

    /** A pack as catalogs list it. */
    public function pack(AssetPack $p, ?User $user, bool $locked): array
    {
        return [
            'id' => $p->id,
            'name' => $p->name,
            'style' => $p->style,
            'official' => $p->isOfficial(),
            'mine' => $user !== null && $p->owner_id === $user->id,
            'tier' => $p->tier,
            'published' => $p->published,
            'locked' => $locked,
            'created_at' => $p->created_at,
        ];
    }

    /** An asset as catalogs list it: a preview always, the picture unless locked. */
    public function asset(Asset $a, bool $locked): array
    {
        return [
            'id' => $a->id,
            'pack_id' => $a->pack_id,
            'name' => $a->name,
            'category' => $a->category,
            'tags' => $a->tags ?? [],
            'width' => $a->width,
            'height' => $a->height,
            'color' => $a->color,
            'meta' => $a->meta ?? (object) [],
            'thumb_url' => $this->urls->temporary($a->disk, $a->thumb_path ?? $a->path),
            'url' => $locked ? null : $this->urls->temporary($a->disk, $a->path),
            'created_at' => $a->created_at,
        ];
    }
}
