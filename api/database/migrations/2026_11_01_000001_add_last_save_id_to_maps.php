<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The id of the save that made a map's current revision (sent by the editor
 * with every save). A save whose answer was lost on the way (a slow or
 * dropped connection) is sent again with the same id: the server recognises
 * it and answers with what it already saved, instead of a conflict (or a
 * second copy of a new map).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('maps', function (Blueprint $table) {
            $table->string('last_save_id', 40)->nullable()->after('revision');
            $table->index(['user_id', 'last_save_id']);
        });
    }

    public function down(): void
    {
        Schema::table('maps', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'last_save_id']);
            $table->dropColumn('last_save_id');
        });
    }
};
