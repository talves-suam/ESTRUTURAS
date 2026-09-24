<?php
/** Teste rápido: .../estruturas/api/health.php */
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

try {
    $pdo = api_pdo();
    $pdo->query('SELECT 1');
    $tables = [];
    foreach (['curriculum_structures', 'curriculum_courses', 'app_settings'] as $t) {
        $st = $pdo->query("SHOW TABLES LIKE " . $pdo->quote($t));
        $tables[$t] = $st && $st->fetch() ? true : false;
    }
    api_ok([
        'mysql' => true,
        'tables' => $tables,
        'ready' => !in_array(false, $tables, true),
    ]);
} catch (Throwable $e) {
    api_fail(500, $e->getMessage());
}
