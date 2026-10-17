<?php

namespace Database\Seeders;

use App\Models\Plan;
use Illuminate\Database\Seeder;

/**
 * The three plans. Safe to re-run: plans are matched by code, so changing a
 * limit here and seeding again updates it in place.
 */
class PlanSeeder extends Seeder
{
    public function run(): void
    {
        // max_line_styles: Line Tool styles a person can save (null = unlimited).
        $plans = [
            // Free: try it out, personal use (a few of your own stamps).
            ['code' => 'explorer', 'name' => 'Explorer', 'tier' => 0, 'max_maps' => 3, 'max_export_px' => 2048,
                'upload_quota_bytes' => 20 * 1024 * 1024, 'max_line_styles' => 10, 'commercial_use' => false, 'is_default' => true, 'sort' => 1],
            // Serious map makers: full library, own uploads, 8K exports.
            ['code' => 'cartographer', 'name' => 'Cartographer', 'tier' => 1, 'max_maps' => 100, 'max_export_px' => 8192,
                'upload_quota_bytes' => 500 * 1024 * 1024, 'max_line_styles' => 200, 'commercial_use' => false, 'is_default' => false, 'sort' => 2],
            // Professionals: unlimited maps, 16K, commercial license.
            ['code' => 'atlas', 'name' => 'Atlas', 'tier' => 2, 'max_maps' => null, 'max_export_px' => 16384,
                'upload_quota_bytes' => 5 * 1024 * 1024 * 1024, 'max_line_styles' => null, 'commercial_use' => true, 'is_default' => false, 'sort' => 3],
        ];
        foreach ($plans as $plan) {
            Plan::query()->updateOrCreate(['code' => $plan['code']], $plan);
        }
    }
}
