<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Line Tool styles: a named look for lines (a dirt road, a kingdom border,
 * a castle wall…). A person's own styles (owner_id set) follow their account
 * into every map; official styles (owner_id null) are published by admins
 * and, like asset packs, carry the minimum plan tier that may use them.
 *
 * Plans gain `max_line_styles`: how many styles a person can save (null =
 * unlimited).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('line_styles', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('owner_id')->nullable()->constrained('users')->cascadeOnDelete();
            $table->string('name', 60);
            // The look as the editor saves it (see app/Support/LineRules.php).
            $table->json('look');
            $table->unsignedTinyInteger('tier')->default(0);
            $table->boolean('published')->default(false);
            $table->unsignedSmallInteger('sort')->default(0);
            $table->timestamps();
            $table->index(['owner_id', 'sort']);
        });

        Schema::table('plans', function (Blueprint $table) {
            $table->unsignedInteger('max_line_styles')->nullable()->after('upload_quota_bytes');
        });
    }

    public function down(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            $table->dropColumn('max_line_styles');
        });
        Schema::dropIfExists('line_styles');
    }
};
