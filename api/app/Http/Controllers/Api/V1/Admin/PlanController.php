<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Resources\PlanResource;
use App\Models\Plan;
use App\Models\Subscription;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The plans' names and limits. A plan's code, tier and default flag are
 * fixed (payments and the web app rely on them); everything else can be
 * tuned here. Once edited here, a plan is no longer reset by the seeder.
 */
class PlanController extends AdminController
{
    public function index(Request $request): JsonResponse
    {
        $counts = Subscription::query()->current()
            ->selectRaw('plan_id, count(distinct user_id) as n')->groupBy('plan_id')->pluck('n', 'plan_id');
        $plans = Plan::query()->orderBy('sort')->orderBy('tier')->get();

        return response()->json(['data' => $plans->map(fn (Plan $p) => static::present($p, $request) + [
            'subscribers' => $p->is_default ? null : (int) ($counts[$p->id] ?? 0),
        ])->all()]);
    }

    public function update(Request $request, Plan $plan): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'min:2', 'max:40'],
            'max_maps' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:1000000'],
            'max_export_px' => ['sometimes', 'integer', 'min:512', 'max:32768'],
            'upload_quota_bytes' => ['sometimes', 'integer', 'min:0', 'max:1099511627776'],
            'max_line_styles' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:100000'],
            'max_text_styles' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:100000'],
            'max_shape_styles' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:100000'],
            'commercial_use' => ['sometimes', 'boolean'],
            'sort' => ['sometimes', 'integer', 'min:0', 'max:1000'],
        ]);
        $before = $plan->only(array_keys($data));
        $plan->fill($data);
        if ($plan->isDirty()) {
            $plan->customized_at = now();
            $plan->save();
            $this->audit()->log('plan.updated', $plan, $before, $plan->only(array_keys($data)));
        }

        return response()->json(['data' => static::present($plan, $request)]);
    }

    private static function present(Plan $p, Request $request): array
    {
        return (new PlanResource($p))->resolve($request) + [
            'id' => $p->id,
            'is_default' => $p->is_default,
            'sort' => $p->sort,
            'customized_at' => $p->customized_at,
        ];
    }
}
