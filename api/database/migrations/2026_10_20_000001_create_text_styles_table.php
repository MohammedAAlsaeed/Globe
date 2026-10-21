<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Text Tool styles: a named look for texts (capital cities, ocean names, a
 * kingdom's title…) — font profile, size, colours, outline, shadow, curve.
 * A person's own styles (owner_id set) follow their account into every map;
 * official styles (owner_id null) are published by admins and, like line
 * styles, carry the minimum plan tier that may use them.
 *
 * Plans gain `max_text_styles`: how many text styles a person can save
 * (null = unlimited).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('text_styles', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('owner_id')->nullable()->constrained('users')->cascadeOnDelete();
            $table->string('name', 60);
            // The look as the editor saves it (see app/Support/TextRules.php).
            $table->json('look');
            $table->unsignedTinyInteger('tier')->default(0);
            $table->boolean('published')->default(false);
            $table->unsignedSmallInteger('sort')->default(0);
            $table->timestamps();
            $table->index(['owner_id', 'sort']);
        });

        Schema::table('plans', function (Blueprint $table) {
            $table->unsignedInteger('max_text_styles')->nullable()->after('max_line_styles');
        });
    }

    public function down(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            $table->dropColumn('max_text_styles');
        });
        Schema::dropIfExists('text_styles');
    }
};
