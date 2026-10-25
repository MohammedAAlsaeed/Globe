<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The audit log, newest first. Read-only, like the log itself. */
class AuditLogController extends AdminController
{
    public function index(Request $request): JsonResponse
    {
        $f = $request->validate([
            'actor' => ['sometimes', 'nullable', 'string', 'max:32'],
            'action' => ['sometimes', 'nullable', 'string', 'max:64'],
            'target_type' => ['sometimes', 'nullable', 'string', 'max:32'],
            'target_id' => ['sometimes', 'nullable', 'string', 'max:64'],
            'from' => ['sometimes', 'nullable', 'date'],
            'to' => ['sometimes', 'nullable', 'date'],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:5', 'max:100'],
        ]);
        $page = AuditLog::query()->filter($f)->latest('created_at')->orderByDesc('id')
            ->paginate($this->perPage($f['per_page'] ?? 50));

        return response()->json([
            'data' => $page->getCollection()->map(fn (AuditLog $l) => [
                'id' => $l->id,
                'action' => $l->action,
                'actor' => $l->actor_id || $l->actor_email ? ['id' => $l->actor_id, 'email' => $l->actor_email] : null,
                'target' => $l->target_type ? ['type' => $l->target_type, 'id' => $l->target_id, 'label' => $l->target_label] : null,
                'changes' => $l->changes,
                'meta' => $l->meta,
                'ip' => $l->ip,
                'user_agent' => $l->user_agent,
                'created_at' => $l->created_at,
            ])->all(),
            'meta' => ['total' => $page->total(), 'page' => $page->currentPage(), 'per_page' => $page->perPage(), 'last_page' => $page->lastPage()],
        ]);
    }
}
