<?php
// Creates the database named in api/.env if it does not exist yet.
$env = [];
foreach (file(__DIR__ . '/../api/.env', FILE_IGNORE_NEW_LINES) as $line) {
    if (preg_match('/^\s*([A-Z_]+)\s*=\s*(.*)$/', $line, $m)) {
        $env[$m[1]] = trim($m[2], "\"' ");
    }
}
$host = $env['DB_HOST'] ?? '127.0.0.1';
$port = $env['DB_PORT'] ?? '5432';
$db   = $env['DB_DATABASE'] ?? 'idrisi';
try {
    $pdo = new PDO("pgsql:host=$host;port=$port;dbname=postgres", $env['DB_USERNAME'] ?? 'postgres', $env['DB_PASSWORD'] ?? '');
} catch (PDOException $e) {
    echo "CONNECT FAILED: " . $e->getMessage() . PHP_EOL;
    exit(2);
}
$exists = $pdo->query("SELECT 1 FROM pg_database WHERE datname = " . $pdo->quote($db))->fetchColumn();
if ($exists) {
    echo "database $db already exists" . PHP_EOL;
} else {
    $pdo->exec('CREATE DATABASE "' . str_replace('"', '""', $db) . '"');
    echo "database $db created" . PHP_EOL;
}
