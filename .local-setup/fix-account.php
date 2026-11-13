<?php
// One-off: corrects a mistyped sign-up email in the local database.
// Usage: php fix-account.php old@example.com new@example.com
require __DIR__ . '/../api/vendor/autoload.php';
$app = require __DIR__ . '/../api/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\User;

[$old, $new] = [$argv[1] ?? '', $argv[2] ?? ''];
echo 'connection: ' . config('database.default') . ' / ' . config('database.connections.' . config('database.default') . '.database') . PHP_EOL;
echo 'users: ' . User::query()->count() . PHP_EOL;
if (User::query()->where('email', $new)->exists()) {
    echo "NOTHING CHANGED: $new already exists" . PHP_EOL;
    exit(User::query()->where('email', $old)->exists() ? 3 : 0);
}
$user = User::query()->where('email', $old)->first();
if (! $user) {
    echo "NOT FOUND: $old" . PHP_EOL;
    exit(2);
}
$fill = ['email' => $new];
$wasVerified = $user->email_verified_at !== null;
if (! $wasVerified) {
    $fill['email_verified_at'] = now();
}
$user->forceFill($fill)->save();
echo "email changed: $old -> $new (user #{$user->getKey()})" . ($wasVerified ? '' : ', marked verified') . PHP_EOL;
