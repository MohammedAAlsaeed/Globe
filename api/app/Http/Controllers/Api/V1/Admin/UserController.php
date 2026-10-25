<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\Role;
use App\Exceptions\ApiException;
use App\Models\Map;
use App\Models\Plan;
use App\Models\User;
use App\Services\Entitlements;
use App\Services\FileUrls;
use App\Services\MapDocuments;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\Rule;

/**
 * People: find them, see everything about their account, and act on it —
 * correct the profile, confirm the email, send a password link, end their
 * sessions, suspend or reinstate, change a staff role, delete for good.
 * Every change is written to the audit log.
 */
class UserController extends AdminController
{
    public function __construct(private Entitlements $entitlements) {}

    public function index(Request $request): JsonResponse
    {
        $f = $request->validate([
            'q' => ['sometimes', 'nullable', 'string', 'max:120'],
            'role' => ['sometimes', 'nullable', Rule::in([...array_column(Role::cases(), 'value'), 'staff'])],
            'status' => ['sometimes', 'nullable', Rule::in(['active', 'suspended', 'unverified', 'two_factor'])],
            'plan' => ['sometimes', 'nullable', 'string', 'max:32'],
            'sort' => ['sometimes', 'nullable', Rule::in(['created_at', '-created_at', 'name', '-name', 'email', '-email', 'last_seen_at', '-last_seen_at', 'maps_count', '-maps_count'])],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:5', 'max:100'],
        ]);
        $sort = $f['sort'] ?? '-created_at';
        $users = User::query()
            ->withCount('maps')
            ->with(['subscriptions' => fn ($q) => $q->current()->with('plan')])
            ->when($f['q'] ?? null, function (Builder $q, string $term) {
                $like = '%'.str_replace(['%', '_'], ['\%', '\_'], mb_strtolower($term)).'%';
                $q->where(fn ($o) => $o->whereRaw('lower(name) like ?', [$like])->orWhereRaw('lower(email) like ?', [$like])->orWhere('id', $term));
            })
            ->when($f['role'] ?? null, fn (Builder $q, string $role) => $role === 'staff'
                ? $q->where('role', '!=', Role::User->value)
                : $q->where('role', $role))
            ->when($f['status'] ?? null, fn (Builder $q, string $s) => match ($s) {
                'suspended' => $q->whereNotNull('suspended_at'),
                'unverified' => $q->whereNull('email_verified_at'),
                'two_factor' => $q->whereNotNull('two_factor_confirmed_at'),
                default => $q->whereNull('suspended_at'),
            })
            ->when($f['plan'] ?? null, function (Builder $q, string $code) {
                $plan = Plan::query()->where('code', $code)->first();
                if (! $plan) {
                    return $q->whereRaw('1 = 0');
                }
                $paid = fn ($s) => $s->current()->whereHas('plan', fn ($p) => $p->where('is_default', false));

                return $plan->is_default
                    ? $q->whereDoesntHave('subscriptions', $paid)
                    : $q->whereHas('subscriptions', fn ($s) => $s->current()->where('plan_id', $plan->id));
            })
            ->orderBy(ltrim($sort, '-'), str_starts_with($sort, '-') ? 'desc' : 'asc')
            ->orderBy('id')
            ->paginate($this->perPage($f['per_page'] ?? null));

        $default = Plan::default();

        return response()->json([
            'data' => $users->getCollection()->map(fn (User $u) => $this->row($u, $default))->all(),
            'meta' => ['total' => $users->total(), 'page' => $users->currentPage(), 'per_page' => $users->perPage(), 'last_page' => $users->lastPage()],
        ]);
    }

    public function show(User $user): JsonResponse
    {
        $user->loadCount(['maps', 'exports', 'lineStyles', 'textStyles', 'shapeStyles', 'assetPacks']);
        $plan = $this->entitlements->plan($user);
        $subscriptions = $user->subscriptions()->with(['plan', 'grantedBy'])->latest('starts_at')->get();
        $maps = $user->maps()->withTrashed()->latest('updated_at')->limit(12)->get();
        $urls = app(FileUrls::class);
        $sessions = config('session.driver') === 'database'
            ? DB::table(config('session.table', 'sessions'))->where('user_id', $user->id)
                ->orderByDesc('last_activity')->limit(10)->get(['ip_address', 'user_agent', 'last_activity'])
                ->map(fn ($s) => ['ip' => $s->ip_address, 'user_agent' => $s->user_agent, 'last_activity' => date(DATE_ATOM, (int) $s->last_activity)])
            : null;

        return response()->json(['data' => array_replace($this->row($user, null, $plan), [
            'locale' => $user->locale,
            'region' => $user->region,
            'avatar_url' => $user->avatar_url,
            'has_password' => $user->password !== null,
            'providers' => $user->socialAccounts()->pluck('provider')->all(),
            'usage' => $this->entitlements->usage($user),
            'counts' => [
                'maps' => $user->maps_count,
                'exports' => $user->exports_count,
                'line_styles' => $user->line_styles_count,
                'text_styles' => $user->text_styles_count,
                'shape_styles' => $user->shape_styles_count,
                'asset_packs' => $user->asset_packs_count,
            ],
            'plan' => [
                'code' => $plan->code, 'name' => $plan->name, 'tier' => $plan->tier,
                'max_maps' => $plan->max_maps, 'upload_quota_bytes' => $plan->upload_quota_bytes,
            ],
            'subscriptions' => $subscriptions->map(fn ($s) => SubscriptionController::present($s))->all(),
            'maps' => $maps->map(fn (Map $m) => [
                'id' => $m->id,
                'name' => $m->name,
                'width' => $m->width,
                'height' => $m->height,
                'revision' => $m->revision,
                'bytes' => $m->document_bytes,
                'thumbnail_url' => $m->thumbnail_path ? $urls->temporary($m->disk, $m->thumbnail_path) : null,
                'updated_at' => $m->updated_at,
                'deleted_at' => $m->deleted_at,
            ])->all(),
            'sessions' => $sessions,
            'suspended_reason' => $user->suspended_reason,
        ])]);
    }

    /** Profile corrections: name, email, language, a confirmed email. */
    public function update(Request $request, User $user): JsonResponse
    {
        $this->guardTarget($request->user(), $user, notSelf: false);
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:80'],
            'email' => ['sometimes', 'string', 'lowercase', 'email', 'max:254', Rule::unique(User::class)->ignore($user->id)],
            'locale' => ['sometimes', Rule::in(config('idrisi.locales'))],
            'email_verified' => ['sometimes', 'boolean'],
        ]);
        $before = $user->only(['name', 'email', 'locale', 'email_verified_at']);
        if (array_key_exists('email_verified', $data)) {
            $user->email_verified_at = $data['email_verified'] ? ($user->email_verified_at ?? now()) : null;
            unset($data['email_verified']);
        }
        if (isset($data['email']) && $data['email'] !== $user->email) {
            // A new address is unconfirmed until its owner confirms it.
            $user->email_verified_at = $request->boolean('email_verified') ? now() : null;
        }
        $user->fill($data)->save();
        $this->audit()->log('user.updated', $user, $before, $user->only(['name', 'email', 'locale', 'email_verified_at']));

        return $this->show($user->fresh());
    }

    /** Emails the person a link to choose a new password. */
    public function sendPasswordReset(Request $request, User $user): Response
    {
        $this->guardTarget($request->user(), $user, notSelf: false);
        $status = Password::sendResetLink(['email' => $user->email]);
        if ($status !== Password::RESET_LINK_SENT) {
            throw new ApiException('reset_not_sent', __($status), 429);
        }
        $this->audit()->log('user.password_reset_sent', $user);

        return response()->noContent();
    }

    /** Signs the person out everywhere (sessions and API tokens). */
    public function endSessions(Request $request, User $user): Response
    {
        $this->guardTarget($request->user(), $user);
        $this->endAllSessions($user);
        $this->audit()->log('user.sessions_ended', $user);

        return response()->noContent();
    }

    public function suspend(Request $request, User $user): JsonResponse
    {
        $this->guardTarget($request->user(), $user);
        $data = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:500']]);
        $user->forceFill(['suspended_at' => now(), 'suspended_reason' => $data['reason']])->save();
        $this->endAllSessions($user);
        $this->audit()->log('user.suspended', $user, meta: ['reason' => $data['reason']]);

        return $this->show($user->fresh());
    }

    public function unsuspend(Request $request, User $user): JsonResponse
    {
        $this->guardTarget($request->user(), $user);
        $before = ['suspended_reason' => $user->suspended_reason];
        $user->forceFill(['suspended_at' => null, 'suspended_reason' => null])->save();
        $this->audit()->log('user.unsuspended', $user, meta: $before);

        return $this->show($user->fresh());
    }

    /** Staff roles (owner only, with a fresh two-factor code). */
    public function setRole(Request $request, User $user): JsonResponse
    {
        $actor = $request->user();
        $data = $request->validate(['role' => ['required', Rule::enum(Role::class)]]);
        if ($actor->is($user)) {
            throw new ApiException('not_on_yourself', 'You can’t change your own role.', 422);
        }
        $role = Role::from($data['role']);
        if ($user->role === Role::Owner && $role !== Role::Owner && User::query()->where('role', Role::Owner->value)->count() <= 1) {
            throw new ApiException('last_owner', 'There must always be an owner.', 422);
        }
        $before = $user->role;
        $user->forceFill(['role' => $role])->save();
        // A new role starts on fresh sessions (and a lowered one at once).
        $this->endAllSessions($user);
        $this->audit()->log('user.role_changed', $user, ['role' => $before], ['role' => $role]);

        return $this->show($user->fresh());
    }

    /** For a lost phone: the person sets up two-factor sign-in again. */
    public function resetTwoFactor(Request $request, User $user): Response
    {
        $actor = $request->user();
        if ($actor->is($user)) {
            throw new ApiException('not_on_yourself', 'Use your recovery codes instead.', 422);
        }
        $user->forceFill(['two_factor_secret' => null, 'two_factor_recovery_codes' => null, 'two_factor_confirmed_at' => null])->save();
        $this->endAllSessions($user);
        $this->audit()->log('user.two_factor_reset', $user);

        return response()->noContent();
    }

    /**
     * Deletes the account and everything in it for good: maps (every
     * revision), uploads, styles, subscriptions. The address must be typed
     * to confirm.
     */
    public function destroy(Request $request, User $user, MapDocuments $documents): Response
    {
        $this->guardTarget($request->user(), $user);
        $request->validate(['confirm' => ['required', 'string', Rule::in([$user->email])]], [
            'confirm.in' => 'Type the account’s email address to confirm.',
        ]);
        if ($user->role === Role::Owner && User::query()->where('role', Role::Owner->value)->count() <= 1) {
            throw new ApiException('last_owner', 'There must always be an owner.', 422);
        }
        $summary = ['maps' => $user->maps()->withTrashed()->count(), 'role' => $user->role->value, 'name' => $user->name];
        // The log entry survives the account (it keeps the email as its label).
        $this->audit()->log('user.deleted', $user, meta: $summary);
        DB::transaction(function () use ($user, $documents) {
            foreach ($user->maps()->withTrashed()->get() as $map) {
                $documents->purge($map);
                $map->forceDelete();
            }
            foreach ($user->assetPacks()->with('assets')->get() as $pack) {
                foreach ($pack->assets as $asset) {
                    $asset->deleteWithFile();
                }
                $pack->delete();
            }
            $this->endAllSessions($user);
            $user->delete();
        });

        return response()->noContent();
    }

    private function endAllSessions(User $user): void
    {
        $user->forceFill(['session_version' => (int) $user->session_version + 1, 'remember_token' => null])->save();
        $user->tokens()->delete();
        if (config('session.driver') === 'database') {
            DB::table(config('session.table', 'sessions'))->where('user_id', $user->id)->delete();
        }
    }

    /** One person in a list. */
    private function row(User $u, ?Plan $default, ?Plan $plan = null): array
    {
        $plan ??= $u->relationLoaded('subscriptions')
            ? (Entitlements::best($u->subscriptions) ?? $default)
            : $this->entitlements->plan($u);

        return [
            'id' => $u->id,
            'name' => $u->name,
            'email' => $u->email,
            'email_verified' => $u->email_verified_at !== null,
            'role' => $u->role->value,
            'plan' => $plan?->code,
            'maps_count' => $u->maps_count ?? null,
            'two_factor' => $u->hasTwoFactor(),
            'suspended' => $u->isSuspended(),
            'suspended_at' => $u->suspended_at,
            'last_seen_at' => $u->last_seen_at,
            'created_at' => $u->created_at,
        ];
    }
}
