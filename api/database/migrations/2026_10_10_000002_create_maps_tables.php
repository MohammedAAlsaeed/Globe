<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A map's metadata. Its document (layers, objects…) is stored
        // compressed in object storage, one file per revision.
        Schema::create('maps', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->unsignedInteger('width');
            $table->unsignedInteger('height');
            $table->unsignedSmallInteger('schema_version')->default(1);
            // Bumped on every save; a save must name the revision it was based
            // on, so two devices never silently overwrite each other.
            $table->unsignedInteger('revision')->default(1);
            $table->string('disk', 32);
            $table->string('document_path');
            $table->unsignedBigInteger('document_bytes');
            $table->string('thumbnail_path')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['user_id', 'deleted_at']);
        });

        // Earlier revisions, kept for restore (pruned to the newest few).
        Schema::create('map_versions', function (Blueprint $table) {
            $table->id();
            $table->foreignUlid('map_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('revision');
            $table->string('document_path');
            $table->unsignedBigInteger('document_bytes');
            $table->timestamp('created_at');
            $table->unique(['map_id', 'revision']);
        });

        // Every export, with the plan in force at that moment: a map exported
        // under a commercial plan stays licensed after a downgrade.
        Schema::create('exports', function (Blueprint $table) {
            $table->id();
            $table->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('map_id')->nullable()->constrained()->nullOnDelete();
            $table->string('plan_code', 32);
            $table->unsignedInteger('width');
            $table->unsignedInteger('height');
            $table->boolean('commercial_use');
            $table->timestamp('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('exports');
        Schema::dropIfExists('map_versions');
        Schema::dropIfExists('maps');
    }
};
