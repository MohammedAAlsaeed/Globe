<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\AssetKind;
use App\Exceptions\ApiException;
use App\Models\Asset;
use App\Models\LineStyle;
use App\Models\ShapeStyle;
use App\Models\TextStyle;
use App\Models\User;
use App\Services\FileUrls;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

/**
 * Everything stored as data that the editor can use — uploaded stamps and
 * line art, saved line, text and shape styles — the official library's and
 * people's own, with the trash.
 *
 * Removing moves an item to the trash: it disappears for everyone at once
 * (maps that placed it draw without it), can be restored for 30 days, and
 * is then deleted for good (`content:purge-trashed`). People's own items
 * need `content.moderate` and a reason; every removal is audited.
 */
class ContentModerationController extends AdminController
{
    /** How long the trash keeps an item (see PurgeTrashedContent). */
    public const TRASH_DAYS = 30;

    private const TYPES = [
        'assets' => Asset::class,
        'line_styles' => LineStyle::class,
        'text_styles' => TextStyle::class,
        'shape_styles' => ShapeStyle::class,
    ];

    public function index(Request $request, FileUrls $urls): JsonResponse
    {
        $f = $request->validate([
            'type' => ['required', Rule::in(array_keys(self::TYPES))],
            'scope' => ['sometimes', 'nullable', Rule::in(['users', 'official', 'all'])],
            'state' => ['sometimes', 'nullable', Rule::in(['live', 'trashed', 'all'])],
            'kind' => ['sometimes', 'nullable', Rule::enum(AssetKind::class)],
            'q' => ['sometimes', 'nullable', 'string', 'max:120'],
            'user' => ['sometimes', 'nullable', 'string', 'max:32'],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:5', 'max:100'],
        ]);
        $type = $f['type'];
        $scope = $f['scope'] ?? 'users';
        $state = $f['state'] ?? 'live';
        if ($scope !== 'official') {
            $this->ensureCanModerate($request->user());
        }
        $assets = $type === 'assets';

        /** @var Builder $query */
        $query = (self::TYPES[$type])::query();
        $query->with($assets ? ['pack.owner:id,name,email'] : ['owner:id,name,email'])
            ->when($state === 'trashed', fn (Builder $q) => $q->onlyTrashed())
            ->when($state === 'all', fn (Builder $q) => $q->withTrashed());

        // Who owns it: an asset through its pack, a style directly.
        $owned = function (Builder $q, callable $where) use ($assets) {
            $assets ? $q->whereHas('pack', $where) : $where($q);
        };
        if ($scope === 'users') {
            $owned($query, fn ($o) => $o->whereNotNull('owner_id'));
        } elseif ($scope === 'official') {
            $owned($query, fn ($o) => $o->whereNull('owner_id'));
        }
        if ($f['user'] ?? null) {
            $owned($query, fn ($o) => $o->where('owner_id', $f['user']));
        }
        if ($assets && ($f['kind'] ?? null)) {
            $query->whereHas('pack', fn ($p) => $p->where('kind', $f['kind']));
        }
        if ($f['q'] ?? null) {
            $term = $f['q'];
            $like = '%'.str_replace(['%', '_'], ['\%', '\_'], mb_strtolower($term)).'%';
            $byOwner = fn ($u) => $u->whereRaw('lower(email) like ?', [$like])->orWhereRaw('lower(name) like ?', [$like]);
            $table = $query->getModel()->getTable();
            $query->where(fn ($o) => $o
                ->whereRaw("lower({$table}.name) like ?", [$like])
                ->orWhere("{$table}.id", $term)
                ->orWhereHas($assets ? 'pack.owner' : 'owner', $byOwner));
        }

        $page = $query
            ->orderByDesc($state === 'trashed' ? 'deleted_at' : 'created_at')
            ->orderBy('id')
            ->paginate($this->perPage($f['per_page'] ?? null));

        return response()->json([
            'data' => $page->getCollection()->map(fn (Model $m) => $this->row($type, $m, $urls))->all(),
            'meta' => ['total' => $page->total(), 'page' => $page->currentPage(), 'per_page' => $page->perPage(), 'last_page' => $page->lastPage()],
        ]);
    }

    /** Moves an item to the trash. */
    public function destroy(Request $request, string $type, string $id): Response
    {
        $model = $this->find($type, $id, trashed: false);
        $owner = $this->ownerId($model);
        if ($owner !== null) {
            $this->ensureCanModerate($request->user());
        }
        $data = $request->validate([
            // A person's own item is never removed without saying why.
            'reason' => [$owner !== null ? 'required' : 'nullable', 'string', 'min:3', 'max:500'],
        ]);
        $reason = $data['reason'] ?? null;

        // Without events: these two fields are bookkeeping, not a content change.
        $model->newQuery()->whereKey($model->getKey())->update([
            'removed_by' => $request->user()->id,
            'removed_reason' => $reason,
        ]);
        $model->delete();
        $this->audit()->log('content.trashed', $model, meta: array_filter([
            'type' => $type,
            'owner' => $owner,
            'reason' => $reason,
        ], fn ($v) => $v !== null));

        return response()->noContent();
    }

    public function restore(Request $request, string $type, string $id): Response
    {
        $model = $this->find($type, $id, trashed: true);
        $owner = $this->ownerId($model);
        if ($owner !== null) {
            $this->ensureCanModerate($request->user());
        }
        $model->restore();
        $model->newQuery()->whereKey($model->getKey())->update(['removed_by' => null, 'removed_reason' => null]);
        $this->audit()->log('content.restored', $model, meta: array_filter(['type' => $type, 'owner' => $owner], fn ($v) => $v !== null));

        return response()->noContent();
    }

    private function find(string $type, string $id, bool $trashed): Model
    {
        if (! isset(self::TYPES[$type])) {
            abort(404);
        }
        /** @var Builder $query */
        $query = (self::TYPES[$type])::query();
        if ($trashed) {
            $query->onlyTrashed();
        }

        return $query->findOrFail($id);
    }

    /** The person an item belongs to; null for the official library. */
    private function ownerId(Model $model): ?string
    {
        return $model instanceof Asset ? $model->pack?->owner_id : $model->getAttribute('owner_id');
    }

    private function ensureCanModerate(User $actor): void
    {
        if (! $actor->hasPermission('content.moderate')) {
            throw new ApiException('forbidden', 'Your role does not allow this.', 403, ['permission' => 'content.moderate']);
        }
    }

    /** @return array<string, mixed> */
    private function row(string $type, Model $m, FileUrls $urls): array
    {
        $asset = $m instanceof Asset;
        $owner = $asset ? $m->pack?->owner : $m->getRelation('owner');
        $deleted = $m->getAttribute('deleted_at');

        return [
            'id' => $m->getKey(),
            'type' => $type,
            'name' => $m->getAttribute('name'),
            'official' => $this->ownerId($m) === null,
            'owner' => $owner ? ['id' => $owner->id, 'name' => $owner->name, 'email' => $owner->email] : null,
            ...($asset ? [
                'kind' => $m->pack?->kind?->value,
                'pack' => $m->pack ? ['id' => $m->pack->id, 'name' => $m->pack->name] : null,
                'url' => $urls->temporary($m->disk, $m->path),
                'width' => $m->width,
                'height' => $m->height,
                'bytes' => $m->bytes,
            ] : [
                'look' => $m->getAttribute('look'),
                'tier' => $m->getAttribute('tier'),
                'published' => $m->getAttribute('published'),
            ]),
            'created_at' => $m->getAttribute('created_at'),
            'deleted_at' => $deleted,
            'purge_at' => $deleted?->copy()->addDays(self::TRASH_DAYS),
            'removed_reason' => $m->getAttribute('removed_reason'),
        ];
    }
}
