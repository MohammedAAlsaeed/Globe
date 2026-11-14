<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Content management from the admin panel:
 *
 * - `content_controls`: what staff decided about art that ships inside the
 *   web app (built-in stamps, line art, styles, textures, templates). The
 *   art itself stays in the app's code; a row here only hides it from the
 *   editor's catalogs. Maps that already use it keep drawing it.
 * - A trash for uploaded stamps and saved styles: staff remove what doesn't
 *   belong (their own official items or a person's uploads); it disappears
 *   at once, can be restored for 30 days, and is then deleted for good
 *   (`content:purge-trashed`).
 * - `map_templates`: official starting maps, made by staff from one of
 *   their own maps.
 */
return new class extends Migration
{
    private const TRASHABLE = ['assets', 'line_styles', 'text_styles', 'shape_styles'];

    public function up(): void
    {
        Schema::create('content_controls', function (Blueprint $table) {
            $table->id();
            // stamp_set | line_art | line_style | text_style | shape_style | texture | template
            $table->string('kind', 24);
            // The item's id in the web app's code (e.g. a stamp set id).
            $table->string('key', 120);
            $table->boolean('hidden')->default(true);
            $table->foreignUlid('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['kind', 'key']);
        });

        foreach (self::TRASHABLE as $name) {
            Schema::table($name, function (Blueprint $table) {
                $table->softDeletes();
                $table->foreignUlid('removed_by')->nullable()->constrained('users')->nullOnDelete();
                $table->string('removed_reason', 500)->nullable();
            });
        }

        Schema::create('map_templates', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->string('name', 80);
            $table->string('name_ar', 80)->nullable();
            $table->unsignedInteger('width');
            $table->unsignedInteger('height');
            $table->string('disk', 32);
            $table->string('document_path');
            $table->unsignedBigInteger('document_bytes');
            $table->string('thumbnail_path')->nullable();
            // Minimum plan tier allowed to start from the template (see plans.tier).
            $table->unsignedTinyInteger('tier')->default(0);
            $table->boolean('published')->default(false);
            $table->unsignedSmallInteger('sort')->default(0);
            $table->foreignUlid('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();
            $table->foreignUlid('removed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('removed_reason', 500)->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('map_templates');
        foreach (self::TRASHABLE as $name) {
            Schema::table($name, function (Blueprint $table) {
                $table->dropConstrainedForeignId('removed_by');
                $table->dropColumn(['removed_reason', 'deleted_at']);
            });
        }
        Schema::dropIfExists('content_controls');
    }
};
