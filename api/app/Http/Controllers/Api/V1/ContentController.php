<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ContentControl;
use Illuminate\Http\JsonResponse;

/**
 * What staff decided about the art that ships inside the web app. Public:
 * the editor asks when it opens, signed in or not, and leaves hidden items
 * out of its catalogs (maps that already use them still draw them).
 */
class ContentController extends Controller
{
    public function controls(): JsonResponse
    {
        return response()
            ->json(['data' => ['hidden' => ContentControl::hidden()]])
            ->header('Cache-Control', 'public, max-age=60');
    }
}
