<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\Role;
use App\Models\Asset;
use App\Models\AssetPack;
use App\Models\Export;
use App\Models\Map;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\Rule;

/**
 * The dashboard's numbers: totals, the last N days day by day, and the mix
 * of plans. Cached for a minute — it's a glance, not a ledger.
 */
class StatsController extends AdminController
{
    public function __invoke(Request $request): JsonResponse
    {
        $days = (int) ($request->validate(['days' => ['sometimes', 'integer', Rule::in([7, 30, 90])]])['days'] ?? 30);
        $data = Cache::remember("admin-stats:{$days}", 60, fn () => $this->compute($days));

        return response()->json(['data' => $data]);
    }

    private function compute(int $days): array
    {
        $since = now()->startOfDay()->subDays($days - 1);
        $prev = $since->copy()->subDays($days);
        $count = fn ($query, Carbon $from, ?Carbon $to = null) => (clone $query)->where('created_at', '>=', $from)
            ->when($to, fn ($q) => $q->where('created_at', '<', $to))->count();

        $paidPlans = Plan::query()->where('is_default', false)->get()->keyBy('id');
        $paying = Subscription::query()->current()->whereIn('plan_id', $paidPlans->keys())
            ->selectRaw('plan_id, count(distinct user_id) as n')->groupBy('plan_id')->pluck('n', 'plan_id');
        $users = User::query()->count();
        $paidUsers = Subscription::query()->current()->whereIn('plan_id', $paidPlans->keys())->distinct('user_id')->count('user_id');

        return [
            'days' => $days,
            'generated_at' => now()->toIso8601String(),
            'totals' => [
                'users' => $users,
                'users_new' => $count(User::query(), $since),
                'users_new_prev' => $count(User::query(), $prev, $since),
                'active' => User::query()->where('last_seen_at', '>=', $since)->count(),
                'verified' => User::query()->whereNotNull('email_verified_at')->count(),
                'suspended' => User::query()->whereNotNull('suspended_at')->count(),
                'staff' => User::query()->where('role', '!=', Role::User->value)->count(),
                'paid' => $paidUsers,
                'maps' => Map::query()->count(),
                'maps_new' => $count(Map::query(), $since),
                'maps_new_prev' => $count(Map::query(), $prev, $since),
                'maps_bytes' => (int) Map::query()->sum('document_bytes'),
                'exports_new' => $count(Export::query(), $since),
                'uploads_bytes' => (int) Asset::query()->whereIn('pack_id', AssetPack::query()->whereNotNull('owner_id')->select('id'))->sum('bytes'),
                'expiring_grants' => Subscription::query()->current()->where('provider', SubscriptionController::MANUAL)
                    ->whereNotNull('ends_at')->where('ends_at', '<=', now()->addDays(14))->count(),
            ],
            'series' => [
                'users' => $this->daily(User::query(), $since, $days),
                'maps' => $this->daily(Map::query(), $since, $days),
            ],
            'plans' => Plan::query()->orderBy('tier')->get()->map(fn (Plan $p) => [
                'code' => $p->code,
                'name' => $p->name,
                'users' => $p->is_default ? max(0, $users - $paidUsers) : (int) ($paying[$p->id] ?? 0),
            ])->all(),
        ];
    }

    /** @return list<array{date: string, n: int}> one entry per day, zeros included */
    private function daily($query, Carbon $since, int $days, string $column = 'created_at'): array
    {
        $rows = (clone $query)->where($column, '>=', $since)
            ->selectRaw("DATE({$column}) as d, count(*) as n")->groupBy('d')->pluck('n', 'd');
        $out = [];
        for ($i = 0; $i < $days; $i++) {
            $d = $since->copy()->addDays($i)->toDateString();
            $out[] = ['date' => $d, 'n' => (int) ($rows[$d] ?? 0)];
        }

        return $out;
    }
}
