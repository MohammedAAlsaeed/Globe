<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // What each plan allows. Limits live here, not in code, so they can be
        // tuned without a deploy. Null limits mean "unlimited".
        Schema::create('plans', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();
            $table->string('name');
            // Asset library tier: a pack is usable when pack.tier <= plan.tier.
            $table->unsignedTinyInteger('tier')->default(0);
            $table->unsignedInteger('max_maps')->nullable();
            $table->unsignedInteger('max_export_px');
            $table->unsignedBigInteger('upload_quota_bytes')->default(0);
            $table->boolean('commercial_use')->default(false);
            $table->boolean('is_default')->default(false);
            $table->unsignedSmallInteger('sort')->default(0);
            $table->timestamps();
        });

        Schema::create('subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('plan_id')->constrained();
            $table->string('status', 16); // active | canceled | expired
            // Payment provider and its reference (null for manual grants).
            $table->string('provider', 32)->nullable();
            $table->string('provider_ref')->nullable();
            $table->timestamp('starts_at');
            $table->timestamp('ends_at')->nullable();
            $table->timestamp('canceled_at')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('subscriptions');
        Schema::dropIfExists('plans');
    }
};
