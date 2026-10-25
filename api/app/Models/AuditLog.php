<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

/**
 * One change made from the admin panel. Append-only: rows can be written
 * and read, never changed or deleted (not even by the owner).
 *
 * @property array{before?: array<string, mixed>, after?: array<string, mixed>}|null $changes
 * @property array<string, mixed>|null $meta
 */
class AuditLog extends Model
{
    protected $table = 'admin_audit_logs';

    public const UPDATED_AT = null;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['changes' => 'array', 'meta' => 'array', 'created_at' => 'datetime'];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('The audit log is append-only.'));
        static::deleting(fn () => throw new LogicException('The audit log is append-only.'));
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }

    public function scopeFilter(Builder $q, array $f): Builder
    {
        return $q
            ->when($f['actor'] ?? null, fn ($q, $v) => $q->where('actor_id', $v))
            ->when($f['action'] ?? null, fn ($q, $v) => $q->where('action', 'like', str_replace(['%', '_'], ['\%', '\_'], $v).'%'))
            ->when($f['target_type'] ?? null, fn ($q, $v) => $q->where('target_type', $v))
            ->when($f['target_id'] ?? null, fn ($q, $v) => $q->where('target_id', $v))
            ->when($f['from'] ?? null, fn ($q, $v) => $q->where('created_at', '>=', $v))
            ->when($f['to'] ?? null, fn ($q, $v) => $q->where('created_at', '<=', $v));
    }
}
