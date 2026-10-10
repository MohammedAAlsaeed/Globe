<?php

namespace App\Console\Commands;

use App\Models\Map;
use App\Services\MapDocuments;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/** Permanently deletes maps that have been in the trash for a while, files included. */
#[Signature('maps:purge-trashed {--days=30}')]
#[Description('Permanently delete maps trashed more than N days ago')]
class PurgeTrashedMaps extends Command
{
    public function handle(MapDocuments $documents): int
    {
        $count = 0;
        Map::onlyTrashed()
            ->where('deleted_at', '<', now()->subDays((int) $this->option('days')))
            ->chunkById(100, function ($maps) use ($documents, &$count) {
                foreach ($maps as $map) {
                    $documents->purge($map);
                    $map->forceDelete();
                    $count++;
                }
            });
        $this->info("Purged {$count} maps.");

        return self::SUCCESS;
    }
}
