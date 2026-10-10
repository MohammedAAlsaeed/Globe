<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A pack groups assets: the official library (owner_id null) or a
        // user's own uploads.
        Schema::create('asset_packs', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('owner_id')->nullable()->constrained('users')->cascadeOnDelete();
            $table->string('name');
            $table->string('kind', 16); // stamps | textures
            // Minimum plan tier allowed to use the pack (see plans.tier).
            $table->unsignedTinyInteger('tier')->default(0);
            $table->boolean('published')->default(false);
            $table->unsignedSmallInteger('sort')->default(0);
            $table->timestamps();
        });

        Schema::create('assets', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('pack_id')->constrained('asset_packs')->cascadeOnDelete();
            $table->string('name');
            $table->json('tags')->nullable();
            $table->string('disk', 32);
            $table->string('path');
            $table->string('mime', 64);
            $table->unsignedBigInteger('bytes');
            $table->unsignedInteger('width')->nullable();
            $table->unsignedInteger('height')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('assets');
        Schema::dropIfExists('asset_packs');
    }
};
