<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The admin panel's foundations:
 *
 *   users            two-factor sign-in for staff (an encrypted TOTP secret
 *                    and hashed recovery codes), suspension (with a reason),
 *                    a session version (bumping it signs the person out on
 *                    every device) and when they were last seen
 *   subscriptions    who granted a manual subscription, and why
 *   plans            when staff last edited a plan (the seeder then leaves it be)
 *   admin_audit_logs every change made from the admin panel, append-only
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->text('two_factor_secret')->nullable()->after('remember_token');
            $table->text('two_factor_recovery_codes')->nullable()->after('two_factor_secret');
            $table->timestamp('two_factor_confirmed_at')->nullable()->after('two_factor_recovery_codes');
            $table->timestamp('suspended_at')->nullable()->after('two_factor_confirmed_at');
            $table->string('suspended_reason', 500)->nullable()->after('suspended_at');
            $table->unsignedInteger('session_version')->default(0)->after('suspended_reason');
            $table->timestamp('last_seen_at')->nullable()->after('session_version');
            $table->index('role');
            $table->index('created_at');
        });

        Schema::table('subscriptions', function (Blueprint $table) {
            $table->foreignUlid('granted_by')->nullable()->after('provider_ref')->constrained('users')->nullOnDelete();
            $table->string('note', 500)->nullable()->after('granted_by');
        });

        Schema::table('plans', function (Blueprint $table) {
            $table->timestamp('customized_at')->nullable();
        });

        Schema::create('admin_audit_logs', function (Blueprint $table) {
            $table->id();
            // Kept when the staff member's account is gone (with their email).
            $table->foreignUlid('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('actor_email')->nullable();
            $table->string('action', 64);
            $table->string('target_type', 32)->nullable();
            $table->string('target_id', 64)->nullable();
            $table->string('target_label')->nullable();
            // { before: {...}, after: {...} } for changes; anything else in meta.
            $table->json('changes')->nullable();
            $table->json('meta')->nullable();
            $table->string('ip', 45)->nullable();
            $table->string('user_agent')->nullable();
            $table->timestamp('created_at')->index();
            $table->index(['target_type', 'target_id']);
            $table->index(['actor_id', 'created_at']);
            $table->index('action');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_audit_logs');
        Schema::table('plans', function (Blueprint $table) {
            $table->dropColumn('customized_at');
        });
        Schema::table('subscriptions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('granted_by');
            $table->dropColumn('note');
        });
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['role']);
            $table->dropIndex(['created_at']);
            $table->dropColumn([
                'two_factor_secret', 'two_factor_recovery_codes', 'two_factor_confirmed_at',
                'suspended_at', 'suspended_reason', 'session_version', 'last_seen_at',
            ]);
        });
    }
};
