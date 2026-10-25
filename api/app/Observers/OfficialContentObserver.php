<?php

namespace App\Observers;

use App\Models\Asset;
use App\Models\AssetPack;
use App\Services\AdminGate;
use App\Services\Audit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/**
 * The official library (packs, stamps, line/text/shape styles with no
 * owner) is staff work, done in the editor itself: every change to it needs
 * a staff session that passed two-factor, and lands in the audit log.
 * Changes made outside a staff request (seeders, artisan) are not gated;
 * everyone else is already kept out of the official library by the policies.
 */
class OfficialContentObserver
{
    public function saving(Model $model): void
    {
        $this->gate($model);
    }

    public function deleting(Model $model): void
    {
        $this->gate($model);
    }

    public function created(Model $model): void
    {
        $this->log($model, 'created', null, $this->visible($model));
    }

    public function updated(Model $model): void
    {
        $changed = array_keys($model->getChanges());
        $changed = array_values(array_diff($changed, ['updated_at']));
        if ($changed === []) {
            return;
        }
        $before = array_intersect_key($model->getOriginal(), array_flip($changed));
        $this->log($model, 'updated', $before, $model->only($changed));
    }

    public function deleted(Model $model): void
    {
        $this->log($model, 'deleted', null, null);
    }

    private function official(Model $model): bool
    {
        if (! $model instanceof Asset) {
            return $model->getAttribute('owner_id') === null;
        }
        if ($model->relationLoaded('pack') && $model->pack) {
            return $model->pack->owner_id === null;
        }

        return AssetPack::query()->whereKey($model->pack_id)->whereNull('owner_id')->exists();
    }

    private function gate(Model $model): void
    {
        $request = request();
        if ($request->user()?->isStaff() && $this->official($model)) {
            AdminGate::ensure($request, $request->user());
        }
    }

    private function log(Model $model, string $verb, ?array $before, ?array $after): void
    {
        if (! request()->user()?->isStaff() || ! $this->official($model)) {
            return;
        }
        $type = match (true) {
            $model instanceof AssetPack => 'pack',
            $model instanceof Asset => 'asset',
            default => Str::snake(class_basename($model)),
        };
        // Looks are long JSON; the log keeps that they changed, not their bytes.
        foreach (['look'] as $bulky) {
            foreach ([&$before, &$after] as &$side) {
                if (is_array($side) && array_key_exists($bulky, $side)) {
                    $side[$bulky] = '(changed)';
                }
            }
            unset($side);
        }
        app(Audit::class)->log("content.{$type}.{$verb}", $model, $before, $after,
            $model instanceof Asset ? ['pack' => $model->pack_id] : []);
    }

    private function visible(Model $model): array
    {
        return array_intersect_key($model->attributesToArray(), array_flip(['name', 'tier', 'published', 'kind', 'category', 'set_key']));
    }
}
