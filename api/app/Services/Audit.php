<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/**
 * Writes the admin audit log: who did what to which record, from where, and
 * what it was before and after. Secrets never reach the log (passwords,
 * two-factor secrets and recovery codes are dropped from every diff).
 */
class Audit
{
    private const SECRET = ['password', 'remember_token', 'two_factor_secret', 'two_factor_recovery_codes'];

    public function __construct(private Request $request) {}

    /**
     * @param  array<string, mixed>|null  $before
     * @param  array<string, mixed>|null  $after
     * @param  array<string, mixed>  $meta
     */
    public function log(
        string $action,
        Model|string|null $target = null,
        ?array $before = null,
        ?array $after = null,
        array $meta = [],
        ?User $actor = null,
    ): AuditLog {
        $actor ??= $this->request->user();
        [$type, $id, $label] = $this->describe($target);
        $changes = null;
        if ($before !== null || $after !== null) {
            [$before, $after] = $this->diff($before ?? [], $after ?? []);
            $changes = ['before' => $before, 'after' => $after];
        }

        return AuditLog::query()->create([
            'actor_id' => $actor?->id,
            'actor_email' => $actor?->email,
            'action' => $action,
            'target_type' => $type,
            'target_id' => $id,
            'target_label' => $label !== null ? mb_substr($label, 0, 250) : null,
            'changes' => $changes,
            'meta' => $meta ?: null,
            'ip' => $this->request->ip(),
            'user_agent' => mb_substr((string) $this->request->userAgent(), 0, 250) ?: null,
            'created_at' => now(),
        ]);
    }

    /** @return array{0: ?string, 1: ?string, 2: ?string} */
    private function describe(Model|string|null $target): array
    {
        if ($target === null) {
            return [null, null, null];
        }
        if (is_string($target)) {
            return [$target, null, null];
        }
        $type = strtolower(class_basename($target));
        $label = $target->getAttribute('email') ?? $target->getAttribute('name') ?? $target->getAttribute('code');

        return [$type, (string) $target->getKey(), is_string($label) ? $label : null];
    }

    /**
     * Only the fields that changed, secrets left out.
     *
     * @return array{0: array<string, mixed>, 1: array<string, mixed>}
     */
    private function diff(array $before, array $after): array
    {
        $keys = array_diff(array_unique([...array_keys($before), ...array_keys($after)]), self::SECRET);
        $b = [];
        $a = [];
        foreach ($keys as $k) {
            $old = $before[$k] ?? null;
            $new = $after[$k] ?? null;
            if ($before !== [] && $after !== [] && $this->same($old, $new)) {
                continue;
            }
            if (array_key_exists($k, $before)) {
                $b[$k] = $this->plain($old);
            }
            if (array_key_exists($k, $after)) {
                $a[$k] = $this->plain($new);
            }
        }

        return [$b, $a];
    }

    private function same(mixed $a, mixed $b): bool
    {
        return json_encode($this->plain($a)) === json_encode($this->plain($b));
    }

    private function plain(mixed $v): mixed
    {
        return match (true) {
            $v instanceof \BackedEnum => $v->value,
            $v instanceof \DateTimeInterface => $v->format(DATE_ATOM),
            default => $v,
        };
    }
}
