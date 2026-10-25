<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Shape Tool styles: a named look for shapes (a stone room, a castle keep, a
 * lake, a kingdom's lands, a fog mask…) — stroke, wall pieces, fill or mask.
 * A person's own styles (owner_id set) follow their account into every map;
 * official styles (owner_id null) are published by admins and, like line and
 * text styles, carry the minimum plan tier that may use them.
 *
 * Plans gain `max_shape_styles`: how many shape styles a person can save
 * (null = unlimited).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shape_styles', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('owner_id')->nullable()->constrained('users')->cascadeOnDelete();
            $table->string('name', 60);
            // The look as the editor saves it (see app/Support/ShapeRules.php).
            $table->json('look');
            $table->unsignedTinyInteger('tier')->default(0);
            $table->boolean('published')->default(false);
            $table->unsignedSmallInteger('sort')->default(0);
            $table->timestamps();
            $table->index(['owner_id', 'sort']);
        });

        Schema::table('plans', function (Blueprint $table) {
            $table->unsignedInteger('max_shape_styles')->nullable()->after('max_text_styles');
        });
    }

    public function down(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            $table->dropColumn('max_shape_styles');
        });
        Schema::dropIfExists('shape_styles');
    }
};
