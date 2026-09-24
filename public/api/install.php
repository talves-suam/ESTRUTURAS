<?php
/**
 * Cria as tabelas uma vez.
 * URL: .../estruturas/api/install.php?token=SEU_TOKEN
 * (token = install_token em config.php)
 */
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$cfg = api_config();
$token = (string) ($_GET['token'] ?? '');
$expected = (string) ($cfg['install_token'] ?? '');

if ($expected === '' || !hash_equals($expected, $token)) {
    api_fail(403, 'Token inválido. Use ?token= igual ao install_token do config.php');
}

$sqlFile = __DIR__ . '/schema.sql';
if (!is_file($sqlFile)) {
    api_fail(500, 'schema.sql não encontrado.');
}

$sql = file_get_contents($sqlFile);
if ($sql === false) {
    api_fail(500, 'Não foi possível ler schema.sql.');
}

try {
    $pdo = api_pdo();
    $pdo->exec($sql);
} catch (Throwable $e) {
    api_fail(500, 'Falha ao criar tabelas: ' . $e->getMessage());
}

api_ok([
    'message' => 'Tabelas criadas/ok. Pode cadastrar estruturas. Esvazie install_token no config.php.',
    'tables' => ['curriculum_structures', 'curriculum_courses', 'app_settings'],
]);
