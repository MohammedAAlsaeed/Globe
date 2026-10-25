<?php

namespace App\Console\Commands;

use App\Enums\Role;
use App\Models\User;
use App\Services\Audit;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * Staff roles from the server's command line — how the first owner is made,
 * and the way back in when an owner loses their two-factor device
 * (`--reset-two-factor`). Changes are written to the audit log.
 */
#[Signature('idrisi:make-admin {email}
    {--role= : owner, admin, editor or support (default admin)}
    {--revoke : Make the user a regular user again}
    {--reset-two-factor : Clear their two-factor sign-in so they set it up again}')]
#[Description('Give (or take away) a staff role in the admin panel')]
class MakeAdmin extends Command
{
    public function handle(): int
    {
        $user = User::query()->where('email', $this->argument('email'))->first();
        if (! $user) {
            $this->error('No user with that email.');

            return self::FAILURE;
        }
        $audit = app(Audit::class);
        if ($this->option('reset-two-factor')) {
            $user->forceFill(['two_factor_secret' => null, 'two_factor_recovery_codes' => null, 'two_factor_confirmed_at' => null])->save();
            $audit->log('user.two_factor_reset', $user, meta: ['source' => 'cli']);
            $this->info("{$user->email} will set up two-factor sign-in again.");
            if (! $this->option('revoke') && $this->option('role') === null) {
                return self::SUCCESS;
            }
        }

        $role = $this->option('revoke') ? Role::User : Role::tryFrom((string) ($this->option('role') ?? 'admin'));
        if (! $role || ($role === Role::User && ! $this->option('revoke'))) {
            $this->error('Unknown role. Use owner, admin, editor or support.');

            return self::FAILURE;
        }
        if ($user->role === Role::Owner && $role !== Role::Owner
            && User::query()->where('role', Role::Owner->value)->count() <= 1) {
            $this->warn('This was the last owner — make someone else owner from the panel or here.');
        }
        $before = $user->role;
        if ($before !== $role) {
            $user->forceFill(['role' => $role, 'session_version' => (int) $user->session_version + 1])->save();
            $audit->log('user.role_changed', $user, ['role' => $before], ['role' => $role], ['source' => 'cli']);
        }
        $this->info("{$user->email} is now {$role->value}.");
        if ($role->isStaff() && ! $user->hasTwoFactor()) {
            $this->line('They set up two-factor sign-in the first time they open /admin.');
        }

        return self::SUCCESS;
    }
}
