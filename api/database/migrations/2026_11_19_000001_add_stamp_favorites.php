<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The Stamp Catalog: a person's favourite stamps (a stamp with the way they
 * like it placed) follow them between devices. Stamps reuse the asset
 * library's previews, colours, `meta` (how a stamp is placed by default)
 * and pack styles added with the texture library.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->json('stamp_favorites')->nullable()->after('texture_favorites');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('stamp_favorites');
        });
    }
};
