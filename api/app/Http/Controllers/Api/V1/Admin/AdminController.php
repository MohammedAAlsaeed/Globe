<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Audit;

/** What every admin controller shares: the audit log and who may act on whom. */
abstract class AdminController extends Controller
{
    protected function audit(): Audit
    {
        return app(Audit::class);
    }

    /**
     * Staff are protected: only someone who manages the staff (the owner)
     * may change, suspend or delete them, and nobody acts on themselves
     * where that could lock them out.
     */
    protected function guardTarget(User $actor, User $target, bool $notSelf = true): void
    {
        if ($notSelf && $actor->is($target)) {
            throw new ApiException('not_on_yourself', 'You can’t do this to your own account.', 422);
        }
        if ($target->isStaff() && ! $actor->hasPermission('staff.manage')) {
            throw new ApiException('staff_protected', 'Only the owner can change staff accounts.', 403);
        }
    }

    /** Page size from the request, within reason. */
    protected function perPage(?int $n): int
    {
        return max(5, min(100, $n ?? 25));
    }
}
