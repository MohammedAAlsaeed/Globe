<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The texture library (the editor's Texture Catalog):
 *
 * - Every uploaded picture can carry a small preview (`thumb_path`), so a
 *   catalog of thousands opens without downloading the full pictures, its
 *   average `color` (shown while the picture loads), and `meta` (for
 *   textures: whether it tiles, the scale it is drawn at by default).
 * - Packs have a `style`: the catalog groups the official library as
 *   creator → style → pack.
 * - A person's favourite textures (a texture with its scale, turn, offsets
 *   and colour adjustments) follow them between devices.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->string('thumb_path')->nullable()->after('path');
            $table->string('color', 7)->nullable()->after('height');
            $table->json('meta')->nullable()->after('color');
        });

        Schema::table('asset_packs', function (Blueprint $table) {
            $table->string('style', 40)->nullable()->after('kind');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->json('texture_favorites')->nullable()->after('preferences');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('texture_favorites');
        });
        Schema::table('asset_packs', function (Blueprint $table) {
            $table->dropColumn('style');
        });
        Schema::table('assets', function (Blueprint $table) {
            $table->dropColumn(['thumb_path', 'color', 'meta']);
        });
    }
};
