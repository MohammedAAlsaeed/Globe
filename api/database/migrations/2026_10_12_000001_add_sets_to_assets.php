<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Stamp sets: assets of a pack that share a `set_key` are variants of one
 * thing (five oaks, three ships), placed at random by the Stamp Tool.
 * `category` files official stamps under the catalog's categories.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->string('set_key', 40)->nullable()->after('name');
            $table->string('category', 16)->nullable()->after('set_key');
            $table->index(['pack_id', 'set_key']);
        });
    }

    public function down(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->dropIndex(['pack_id', 'set_key']);
            $table->dropColumn(['set_key', 'category']);
        });
    }
};
