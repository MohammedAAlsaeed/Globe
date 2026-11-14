<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\MapTemplate;
use App\Models\Plan;
use App\Models\User;
use App\Services\Entitlements;
use App\Services\FileUrls;
use App\Services\TemplateFiles;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

/**
 * Official starting maps, for the "Create a map" dialog. Public: a guest
 * gets what the default plan includes; templates above the person's plan
 * are listed as locked and their document is refused.
 */
class TemplateController extends Controller
{
    public function __construct(private Entitlements $entitlements) {}

    public function index(FileUrls $urls): JsonResponse
    {
        $user = $this->user();
        $tier = $this->tier($user);
        $templates = MapTemplate::query()->where('published', true)->orderBy('sort')->orderBy('name')->get();

        return response()->json([
            'data' => $templates->map(fn (MapTemplate $t) => [
                'id' => $t->id,
                'name' => $t->name,
                'name_ar' => $t->name_ar,
                'width' => $t->width,
                'height' => $t->height,
                'tier' => $t->tier,
                'locked' => $t->tier > $tier,
                'thumbnail_url' => $urls->temporary($t->disk, $t->thumbnail_path),
            ])->all(),
        ]);
    }

    public function document(MapTemplate $template, TemplateFiles $files): Response
    {
        $user = $this->user();
        if (! $template->published && ! $user?->isAdmin()) {
            abort(404);
        }
        if ($template->tier > $this->tier($user)) {
            throw ApiException::planLimit('tier', $template->tier);
        }

        return response($files->read($template), 200, [
            'Content-Type' => 'application/json',
            'Cache-Control' => 'no-store',
        ]);
    }

    /** The signed-in person, if any (these routes don't require one). */
    private function user(): ?User
    {
        $user = auth('sanctum')->user();

        return $user instanceof User ? $user : null;
    }

    /** The plan tier in force: the person's, or the default plan's for a guest. Admins use everything. */
    private function tier(?User $user): int
    {
        if ($user?->isAdmin()) {
            return PHP_INT_MAX;
        }

        return $user ? $this->entitlements->plan($user)->tier : Plan::default()->tier;
    }
}
