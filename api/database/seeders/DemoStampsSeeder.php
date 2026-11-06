<?php

namespace Database\Seeders;

use App\Models\AssetPack;
use App\Services\FileUrls;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Test data for the stamp library: a few published official packs whose
 * stamps are simple shapes drawn here (no uploads, no outside files), so the
 * admin content page, the plan tiers and the Stamp Tool all have something
 * real to show.
 *
 * Run it:   php artisan db:seed --class=DemoStampsSeeder
 * Undo it:  php artisan db:seed --class=DemoStampsSeeder -- --fresh   (same
 * command; it always clears its own packs first, so re-running is safe and
 * never duplicates). These packs are the only ones whose name starts with
 * self::PREFIX, so they are easy to find and delete from the admin page too.
 */
class DemoStampsSeeder extends Seeder
{
    /** Marks a pack as this seeder's, for a clean re-run and easy removal. */
    public const PREFIX = '🧪 ';

    private const SIZE = 256;

    public function run(): void
    {
        if (! extension_loaded('gd')) {
            $this->command?->error('The GD extension is required to draw the demo stamps. Enable ext-gd and re-run.');

            return;
        }

        $disk = config('regions.regions.'.config('regions.default').'.disk');

        // Clear any earlier run first (its rows and its files), so re-running
        // replaces rather than piles up.
        AssetPack::query()
            ->whereNull('owner_id')
            ->where('name', 'like', self::PREFIX.'%')
            ->with('assets') // eager-loaded: the app forbids lazy loading off production
            ->get()
            ->each(function (AssetPack $pack) {
                $pack->assets->each->deleteWithFile();
                $pack->delete();
            });

        foreach ($this->packs() as $spec) {
            $pack = AssetPack::query()->create([
                'name' => self::PREFIX.$spec['name'],
                'kind' => 'stamps',
                'tier' => $spec['tier'],
                'published' => true,
                'sort' => $spec['sort'],
            ]);

            foreach ($spec['sets'] as $set) {
                foreach ($set['shapes'] as $i => $shape) {
                    $png = $this->draw($shape, $set['color']);
                    $path = "assets/library/{$pack->id}/".Str::ulid().'.png';
                    Storage::disk($disk)->put($path, $png, [
                        'ContentType' => 'image/png',
                        'CacheControl' => FileUrls::CACHE_CONTROL,
                    ]);
                    $pack->assets()->create([
                        'name' => count($set['shapes']) > 1 ? "{$set['name']} {$i}" : $set['name'],
                        'set_key' => $set['key'],
                        'category' => $set['category'],
                        'tags' => ['demo'],
                        'disk' => $disk,
                        'path' => $path,
                        'mime' => 'image/png',
                        'bytes' => strlen($png),
                        'width' => self::SIZE,
                        'height' => self::SIZE,
                    ]);
                }
            }

            $this->command?->info("Seeded pack “{$pack->name}” with {$pack->assets()->count()} stamps.");
        }
    }

    /**
     * The packs to create. Two tiers so the lock/upgrade state is testable;
     * sets with several shapes exercise the variants feature.
     *
     * @return list<array{name:string,tier:int,sort:int,sets:list<array<string,mixed>>}>
     */
    private function packs(): array
    {
        return [
            [
                'name' => 'عيّنة التضاريس',
                'tier' => 0,
                'sort' => 90,
                'sets' => [
                    ['key' => 'demo-mountain', 'name' => 'جبل', 'category' => 'terrain', 'color' => [120, 124, 138], 'shapes' => ['mountain', 'mountain2']],
                    ['key' => 'demo-hill', 'name' => 'تل', 'category' => 'terrain', 'color' => [150, 168, 120], 'shapes' => ['hill']],
                    ['key' => 'demo-tree', 'name' => 'شجرة', 'category' => 'vegetation', 'color' => [92, 140, 96], 'shapes' => ['tree', 'tree2', 'pine']],
                ],
            ],
            [
                'name' => 'عيّنة العمران (مدفوعة)',
                'tier' => 1,
                'sort' => 91,
                'sets' => [
                    ['key' => 'demo-tower', 'name' => 'برج', 'category' => 'settlements', 'color' => [170, 150, 120], 'shapes' => ['tower']],
                    ['key' => 'demo-tent', 'name' => 'خيمة', 'category' => 'settlements', 'color' => [196, 170, 128], 'shapes' => ['tent', 'tent2']],
                    ['key' => 'demo-waves', 'name' => 'أمواج', 'category' => 'water', 'color' => [96, 142, 180], 'shapes' => ['waves']],
                ],
            ],
        ];
    }

    /**
     * Draws one stamp as a flat silhouette on a transparent square and
     * returns the PNG bytes. Simple generic shapes, invented here.
     *
     * @param  array{0:int,1:int,2:int}  $rgb
     */
    private function draw(string $shape, array $rgb): string
    {
        $s = self::SIZE;
        $img = imagecreatetruecolor($s, $s);
        imagealphablending($img, false);
        imagesavealpha($img, true);
        imagefill($img, 0, 0, imagecolorallocatealpha($img, 0, 0, 0, 127));
        imagealphablending($img, true);

        $fill = imagecolorallocate($img, $rgb[0], $rgb[1], $rgb[2]);
        $dark = imagecolorallocate($img, (int) ($rgb[0] * 0.65), (int) ($rgb[1] * 0.65), (int) ($rgb[2] * 0.65));
        $light = imagecolorallocate($img, min(255, (int) ($rgb[0] * 1.25)), min(255, (int) ($rgb[1] * 1.25)), min(255, (int) ($rgb[2] * 1.25)));

        // A short DSL: each entry is [kind, color, ...coords] in a 0..1 box.
        $parts = match ($shape) {
            'mountain' => [['poly', $fill, [0.12, 0.88, 0.5, 0.2, 0.88, 0.88]], ['poly', $light, [0.5, 0.2, 0.62, 0.42, 0.42, 0.42]]],
            'mountain2' => [['poly', $fill, [0.08, 0.88, 0.4, 0.34, 0.6, 0.6, 0.78, 0.3, 0.95, 0.88]], ['poly', $light, [0.4, 0.34, 0.5, 0.5, 0.3, 0.5]]],
            'hill' => [['arc', $fill, 0.5, 1.02, 0.9, 0.9]],
            'tree' => [['rect', $dark, 0.45, 0.6, 0.55, 0.9], ['circle', $fill, 0.5, 0.42, 0.56]],
            'tree2' => [['rect', $dark, 0.46, 0.62, 0.54, 0.9], ['circle', $fill, 0.38, 0.46, 0.4], ['circle', $fill, 0.6, 0.4, 0.46], ['circle', $light, 0.52, 0.5, 0.3]],
            'pine' => [['rect', $dark, 0.46, 0.74, 0.54, 0.92], ['poly', $fill, [0.5, 0.1, 0.74, 0.78, 0.26, 0.78]], ['poly', $light, [0.5, 0.1, 0.58, 0.42, 0.42, 0.42]]],
            'tower' => [['rect', $fill, 0.36, 0.3, 0.64, 0.92], ['rect', $dark, 0.36, 0.3, 0.64, 0.4], ['rect', $fill, 0.36, 0.22, 0.43, 0.3], ['rect', $fill, 0.57, 0.22, 0.64, 0.3], ['rect', $fill, 0.47, 0.22, 0.53, 0.3]],
            'tent' => [['poly', $fill, [0.5, 0.2, 0.86, 0.86, 0.14, 0.86]], ['poly', $dark, [0.5, 0.2, 0.58, 0.86, 0.42, 0.86]]],
            'tent2' => [['poly', $fill, [0.5, 0.24, 0.9, 0.84, 0.1, 0.84]], ['poly', $light, [0.5, 0.24, 0.5, 0.84, 0.2, 0.84]]],
            'waves' => [['arc', $fill, 0.3, 0.5, 0.36, 0.3], ['arc', $fill, 0.68, 0.5, 0.36, 0.3], ['arc', $light, 0.5, 0.74, 0.5, 0.34]],
            default => [['circle', $fill, 0.5, 0.5, 0.7]],
        };

        foreach ($parts as $p) {
            [$kind, $color] = $p;
            match ($kind) {
                'rect' => imagefilledrectangle($img, (int) ($p[2] * $s), (int) ($p[3] * $s), (int) ($p[4] * $s), (int) ($p[5] * $s), $color),
                'circle' => imagefilledellipse($img, (int) ($p[2] * $s), (int) ($p[3] * $s), (int) ($p[4] * $s), (int) ($p[4] * $s), $color),
                'arc' => imagefilledellipse($img, (int) ($p[2] * $s), (int) ($p[3] * $s), (int) ($p[4] * $s), (int) ($p[5] * $s), $color),
                'poly' => $this->poly($img, $p[2], $color, $s),
                default => null,
            };
        }

        ob_start();
        imagepng($img);
        imagedestroy($img);

        return (string) ob_get_clean();
    }

    /** @param  list<float>  $pts  x0,y0,x1,y1,… in the 0..1 box. */
    private function poly($img, array $pts, int $color, int $s): void
    {
        $scaled = array_map(fn ($v, $k) => (int) ($v * $s), $pts, array_keys($pts));
        imagefilledpolygon($img, $scaled, $color);
    }
}
