<?php

namespace App\Console\Commands;

use App\Models\Asset;
use App\Models\LineStyle;
use App\Models\MapTemplate;
use App\Models\ShapeStyle;
use App\Models\TextStyle;
use App\Services\TemplateFiles;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * Permanently deletes what staff moved to the content trash a while ago:
 * uploaded stamps and line art (with their files), saved styles and
 * official templates.
 */
#[Signature('content:purge-trashed {--days=30}')]
#[Description('Permanently delete content trashed more than N days ago')]
class PurgeTrashedContent extends Command
{
    public function handle(TemplateFiles $templates): int
    {
        $before = now()->subDays((int) $this->option('days'));
        $count = 0;

        Asset::onlyTrashed()->where('deleted_at', '<', $before)
            ->chunkById(100, function ($assets) use (&$count) {
                foreach ($assets as $asset) {
                    $asset->deleteWithFile();
                    $count++;
                }
            });
        foreach ([LineStyle::class, TextStyle::class, ShapeStyle::class] as $model) {
            $model::onlyTrashed()->where('deleted_at', '<', $before)
                ->chunkById(100, function ($styles) use (&$count) {
                    foreach ($styles as $style) {
                        $style->forceDelete();
                        $count++;
                    }
                });
        }
        MapTemplate::onlyTrashed()->where('deleted_at', '<', $before)
            ->chunkById(100, function ($list) use ($templates, &$count) {
                foreach ($list as $template) {
                    $templates->purge($template);
                    $template->forceDelete();
                    $count++;
                }
            });
        $this->info("Purged {$count} items.");

        return self::SUCCESS;
    }
}
