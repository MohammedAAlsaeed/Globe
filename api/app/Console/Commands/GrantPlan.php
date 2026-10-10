<?php

namespace App\Console\Commands;

use App\Enums\SubscriptionStatus;
use App\Models\Plan;
use App\Models\User;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/** Gives a user a plan by hand (testing, gifts, support) — no payment involved. */
#[Signature('idrisi:grant-plan {email} {plan : Plan code, e.g. cartographer} {--days= : Length; omit for no end}')]
#[Description('Grant a subscription plan to a user manually')]
class GrantPlan extends Command
{
    public function handle(): int
    {
        $user = User::query()->where('email', $this->argument('email'))->first();
        $plan = Plan::query()->where('code', $this->argument('plan'))->first();
        if (! $user || ! $plan) {
            $this->error(! $user ? 'No user with that email.' : 'No plan with that code.');

            return self::FAILURE;
        }
        $days = $this->option('days');
        $user->subscriptions()->create([
            'plan_id' => $plan->id,
            'status' => SubscriptionStatus::Active,
            'provider' => 'manual',
            'starts_at' => now(),
            'ends_at' => $days ? now()->addDays((int) $days) : null,
        ]);
        $this->info("{$user->email} is now on {$plan->name}".($days ? " for {$days} days." : '.'));

        return self::SUCCESS;
    }
}
