<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\PlanResource;
use App\Models\Plan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The plans and their limits — public, so the web app can compare them
 * wherever a limit is reached (and on a pricing page), signed in or not.
 */
class PlanController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $plans = Plan::query()->orderBy('sort')->orderBy('tier')->get();

        return response()->json(['data' => PlanResource::collection($plans)->resolve($request)]);
    }
}
