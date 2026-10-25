<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\SubscriptionStatus;
use App\Exceptions\ApiException;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

/**
 * Subscriptions. Staff grant plans by hand (support, gifts, partners) and
 * can extend or end those grants. Paid subscriptions belong to the payment
 * provider: they are shown here but never edited from the panel.
 */
class SubscriptionController extends AdminController
{
    public const MANUAL = 'manual';

    public function index(Request $request): JsonResponse
    {
        $f = $request->validate([
            'q' => ['sometimes', 'nullable', 'string', 'max:120'],
            'state' => ['sometimes', 'nullable', Rule::in(['current', 'ended', 'expiring'])],
            'plan' => ['sometimes', 'nullable', 'string', 'max:32'],
            'provider' => ['sometimes', 'nullable', 'string', 'max:32'],
            'user' => ['sometimes', 'nullable', 'string', 'max:32'],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:5', 'max:100'],
        ]);
        $page = Subscription::query()
            ->with(['plan', 'user', 'grantedBy'])
            ->when($f['q'] ?? null, function (Builder $q, string $term) {
                $like = '%'.str_replace(['%', '_'], ['\%', '\_'], mb_strtolower($term)).'%';
                $q->whereHas('user', fn ($u) => $u->whereRaw('lower(email) like ?', [$like])->orWhereRaw('lower(name) like ?', [$like]));
            })
            ->when($f['user'] ?? null, fn (Builder $q, string $id) => $q->where('user_id', $id))
            ->when($f['plan'] ?? null, fn (Builder $q, string $code) => $q->whereHas('plan', fn ($p) => $p->where('code', $code)))
            ->when($f['provider'] ?? null, fn (Builder $q, string $p) => $q->where('provider', $p))
            ->when($f['state'] ?? null, fn (Builder $q, string $state) => match ($state) {
                'current' => $q->current(),
                'expiring' => $q->current()->whereNotNull('ends_at')->where('ends_at', '<=', now()->addDays(14)),
                default => $q->where(fn ($o) => $o->where('status', SubscriptionStatus::Expired)->orWhere('ends_at', '<=', now())),
            })
            ->latest('starts_at')
            ->orderByDesc('id')
            ->paginate($this->perPage($f['per_page'] ?? null));

        return response()->json([
            'data' => $page->getCollection()->map(fn ($s) => static::present($s))->all(),
            'meta' => ['total' => $page->total(), 'page' => $page->currentPage(), 'per_page' => $page->perPage(), 'last_page' => $page->lastPage()],
        ]);
    }

    /** Grants a plan: for a number of days, until a date, or with no end. */
    public function store(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'plan' => ['required', 'string', Rule::exists(Plan::class, 'code')->where('is_default', false)],
            'days' => ['nullable', 'integer', 'min:1', 'max:3650', 'prohibits:ends_at'],
            'ends_at' => ['nullable', 'date', 'after:now'],
            'note' => ['required', 'string', 'min:3', 'max:500'],
        ]);
        $plan = Plan::query()->where('code', $data['plan'])->firstOrFail();
        $ends = isset($data['days']) ? now()->addDays((int) $data['days'])
            : (isset($data['ends_at']) ? Carbon::parse($data['ends_at']) : null);

        // One manual grant at a time: a new one replaces the previous grant.
        $replaced = $user->subscriptions()->current()->where('provider', self::MANUAL)->get();
        foreach ($replaced as $old) {
            $old->forceFill(['status' => SubscriptionStatus::Expired, 'ends_at' => now()])->save();
        }
        $sub = $user->subscriptions()->create([
            'plan_id' => $plan->id,
            'status' => SubscriptionStatus::Active,
            'provider' => self::MANUAL,
            'starts_at' => now(),
            'ends_at' => $ends,
            'granted_by' => $request->user()->id,
            'note' => $data['note'],
        ]);
        $this->audit()->log('subscription.granted', $user, after: [
            'plan' => $plan->code, 'ends_at' => $ends?->toAtomString(),
        ], meta: ['note' => $data['note'], 'subscription' => $sub->id, 'replaced' => $replaced->pluck('id')->all()]);

        return response()->json(['data' => static::present($sub->load(['plan', 'user', 'grantedBy']))], 201);
    }

    /** Extends or shortens a grant, or edits its note. */
    public function update(Request $request, Subscription $subscription): JsonResponse
    {
        $this->ensureManual($subscription);
        $data = $request->validate([
            'ends_at' => ['sometimes', 'nullable', 'date', 'after:now'],
            'note' => ['sometimes', 'string', 'min:3', 'max:500'],
        ]);
        $before = ['ends_at' => $subscription->ends_at?->toAtomString(), 'note' => $subscription->note];
        if (array_key_exists('ends_at', $data)) {
            $subscription->ends_at = $data['ends_at'] ? Carbon::parse($data['ends_at']) : null;
        }
        if (isset($data['note'])) {
            $subscription->note = $data['note'];
        }
        $subscription->save();
        $this->audit()->log('subscription.updated', $subscription->user, $before,
            ['ends_at' => $subscription->ends_at?->toAtomString(), 'note' => $subscription->note],
            ['subscription' => $subscription->id]);

        return response()->json(['data' => static::present($subscription->load(['plan', 'user', 'grantedBy']))]);
    }

    /** Ends a grant now. */
    public function revoke(Request $request, Subscription $subscription): JsonResponse
    {
        $this->ensureManual($subscription);
        $data = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:500']]);
        $subscription->forceFill(['status' => SubscriptionStatus::Expired, 'ends_at' => now()])->save();
        $this->audit()->log('subscription.revoked', $subscription->user,
            meta: ['subscription' => $subscription->id, 'plan' => $subscription->plan?->code, 'reason' => $data['reason']]);

        return response()->json(['data' => static::present($subscription->load(['plan', 'user', 'grantedBy']))]);
    }

    private function ensureManual(Subscription $s): void
    {
        if ($s->provider !== self::MANUAL) {
            throw new ApiException('provider_managed', 'Paid subscriptions are managed by the payment provider.', 409);
        }
        if ($s->status === SubscriptionStatus::Expired || ($s->ends_at && $s->ends_at->isPast())) {
            throw new ApiException('subscription_ended', 'This subscription has already ended.', 409);
        }
    }

    public static function present(Subscription $s): array
    {
        $current = $s->status !== SubscriptionStatus::Expired
            && $s->starts_at <= now() && ($s->ends_at === null || $s->ends_at->isFuture());

        return [
            'id' => $s->id,
            'plan' => $s->plan ? ['code' => $s->plan->code, 'name' => $s->plan->name, 'tier' => $s->plan->tier] : null,
            'user' => $s->relationLoaded('user') && $s->user ? ['id' => $s->user->id, 'name' => $s->user->name, 'email' => $s->user->email] : null,
            'status' => $s->status->value,
            'current' => $current,
            'provider' => $s->provider,
            'provider_ref' => $s->provider_ref,
            'manual' => $s->provider === self::MANUAL,
            'granted_by' => $s->relationLoaded('grantedBy') && $s->grantedBy ? ['id' => $s->grantedBy->id, 'name' => $s->grantedBy->name, 'email' => $s->grantedBy->email] : null,
            'note' => $s->note,
            'starts_at' => $s->starts_at,
            'ends_at' => $s->ends_at,
            'canceled_at' => $s->canceled_at,
            'created_at' => $s->created_at,
        ];
    }
}
