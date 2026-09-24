<?php
/**
 * Configurações do app (documento único)
 * GET → settings
 * PUT|POST body JSON → grava
 */
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/auth_lib.php';

api_require_auth();
$pdo = api_pdo();
$method = api_method();
const SETTINGS_ID = 'app_settings';

try {
    if ($method === 'GET') {
        $st = $pdo->prepare('SELECT payload FROM app_settings WHERE id = ? LIMIT 1');
        $st->execute([SETTINGS_ID]);
        $row = $st->fetch();
        $item = $row ? api_decode_payload($row['payload'] ?? null) : null;
        api_ok($item);
    }

    if ($method === 'POST' || $method === 'PUT') {
        $item = api_read_json();
        if ($item === []) {
            api_fail(400, 'Corpo JSON vazio.');
        }
        $updatedAt = trim((string) ($item['updatedAt'] ?? ''));
        if ($updatedAt === '') {
            $updatedAt = gmdate('Y-m-d\TH:i:s.000\Z');
            $item['updatedAt'] = $updatedAt;
        }
        $payload = api_encode_payload($item);

        $st = $pdo->prepare(
            'INSERT INTO app_settings (id, updated_at, payload)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE
               updated_at = VALUES(updated_at),
               payload = VALUES(payload)'
        );
        $st->execute([
            SETTINGS_ID,
            date('Y-m-d H:i:s', strtotime($updatedAt) ?: time()),
            $payload,
        ]);
        api_ok($item);
    }

    api_fail(405, 'Método não permitido.');
} catch (Throwable $e) {
    api_fail(500, $e->getMessage());
}
