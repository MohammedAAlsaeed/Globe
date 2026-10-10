<?php

namespace App\Console\Commands;

use App\Enums\Role;
use App\Models\User;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('idrisi:make-admin {email} {--revoke : Make the user a regular user again}')]
#[Description('Give (or take away) platform admin rights')]
class MakeAdmin extends Command
{
    public function handle(): int
    {
        $user = User::query()->where('email', $this->argument('email'))->first();
        if (! $user) {
            $this->error('No user with that email.');

            return self::FAILURE;
        }
        $user->forceFill(['role' => $this->option('revoke') ? Role::User : Role::Admin])->save();
        $this->info("{$user->email} is now ".$user->role->value.'.');

        return self::SUCCESS;
    }
}
