<?php

namespace Tests\Feature;

use App\Providers\AppServiceProvider;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class CheckDeployTest extends TestCase
{
    /** A production server set up the way the deploy guide says. */
    private function goodProduction(): void
    {
        config([
            'app.env' => 'production',
            'app.debug' => false,
            'app.url' => 'https://api.example-atlas.com',
            'idrisi.frontend_url' => 'https://example-atlas.com',
            'idrisi.trusted_proxies' => '*',
            'session.domain' => '.example-atlas.com',
            'session.secure' => true,
            'sanctum.stateful' => ['example-atlas.com'],
            'cors.allowed_origins' => ['https://example-atlas.com'],
            'mail.default' => 'resend',
            'mail.from.address' => 'hello@example-atlas.com',
            'services.google.client_id' => 'id',
            'services.google.redirect' => 'https://api.example-atlas.com/auth/google/callback',
            'regions.regions.global.disk' => 's3',
            'filesystems.disks.s3.key' => 'k',
            'filesystems.disks.s3.secret' => 's',
            'filesystems.disks.s3.bucket' => 'idrisi-prod',
            'queue.default' => 'database',
            'app.maintenance.driver' => 'cache',
        ]);
    }

    public function test_a_well_configured_production_server_passes(): void
    {
        $this->goodProduction();
        // (a warning or two may come from the tests' own database: SQLite here)
        $this->artisan('idrisi:check-deploy')->expectsOutputToContain('Ready')->assertSuccessful();
    }

    public function test_settings_that_break_sign_in_are_errors(): void
    {
        // the cookie domain doesn't cover the API
        $this->goodProduction();
        config(['session.domain' => '.other.com']);
        $this->artisan('idrisi:check-deploy')->expectsOutputToContain('must cover both')->assertFailed();

        // the site and the API on different domains
        $this->goodProduction();
        config(['app.url' => 'https://atlas-api.herokuapp.com']);
        $this->artisan('idrisi:check-deploy')->expectsOutputToContain('must share one domain')->assertFailed();

        // Sanctum doesn't know the site
        $this->goodProduction();
        config(['sanctum.stateful' => ['localhost:3000']]);
        $this->artisan('idrisi:check-deploy')->expectsOutputToContain('SANCTUM_STATEFUL_DOMAINS must include example-atlas.com')->assertFailed();
    }

    public function test_unsafe_or_unfinished_production_settings_are_errors(): void
    {
        foreach ([
            ['app.debug' => true],
            ['session.secure' => false],
            ['app.url' => 'http://api.example-atlas.com'],
            ['mail.default' => 'log'],
            ['regions.regions.global.disk' => 'local'],
            ['filesystems.disks.s3.bucket' => null],
            ['services.google.redirect' => 'http://localhost:8000/auth/google/callback'],
        ] as $bad) {
            $this->goodProduction();
            config($bad);
            $this->artisan('idrisi:check-deploy')->assertFailed();
        }
    }

    public function test_country_domains_and_local_development(): void
    {
        $this->goodProduction();
        config([
            'app.url' => 'https://api.atlas.com.sa',
            'idrisi.frontend_url' => 'https://atlas.com.sa',
            'session.domain' => '.atlas.com.sa',
            'sanctum.stateful' => ['atlas.com.sa'],
            'cors.allowed_origins' => ['https://atlas.com.sa'],
            'mail.from.address' => 'hello@atlas.com.sa',
            'services.google.redirect' => 'https://api.atlas.com.sa/auth/google/callback',
        ]);
        $this->artisan('idrisi:check-deploy')->assertSuccessful();

        // local development: http, no cookie domain, files on disk are fine
        config([
            'app.env' => 'local',
            'app.url' => 'http://localhost:8000',
            'idrisi.frontend_url' => 'http://localhost:3000',
            'session.domain' => null,
            'session.secure' => null,
            'sanctum.stateful' => ['localhost:3000'],
            'cors.allowed_origins' => ['http://localhost:3000'],
            'mail.default' => 'log',
            'services.google.client_id' => null,
            'regions.regions.global.disk' => 'local',
        ]);
        $this->artisan('idrisi:check-deploy')->assertSuccessful();
    }

    public function test_maintenance_must_reach_every_server(): void
    {
        $this->goodProduction();
        config(['app.maintenance.driver' => 'file']);
        $this->artisan('idrisi:check-deploy')->expectsOutputToContain('APP_MAINTENANCE_DRIVER')->assertSuccessful();
    }

    public function test_an_https_site_builds_https_links(): void
    {
        config(['app.url' => 'https://api.example-atlas.com']);
        (new AppServiceProvider($this->app))->boot();
        $this->assertStringStartsWith('https://', URL::to('/x'));
    }
}
