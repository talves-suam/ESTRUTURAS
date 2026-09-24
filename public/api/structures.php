<?php
/**
 * Estruturas curriculares
 * GET    → lista
 * PUT/POST body JSON { id, ... } → grava (upsert)
 * DELETE ?id= → apaga
 */
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/auth_lib.php';

api_require_auth();
$pdo = api_pdo();
$method = api_method();

try {
    if ($method === 'GET') {
        $id = isset($_GET['id']) ? trim((string) $_GET['id']) : '';
        if ($id !== '') {
            $st = $pdo->prepare('SELECT payload FROM curriculum_structures WHERE id = ? LIMIT 1');
            $st->execute([$id]);
            $row = $st->fetch();
            $item = $row ? api_decode_payload($row['payload'] ?? null) : null;
            if (!$item) {
                api_fail(404, 'Estrutura não encontrada.');
            }
            api_ok($item);
        }

        $st = $pdo->query('SELECT payload FROM curriculum_structures ORDER BY updated_at DESC, code ASC');
        $list = [];
        while ($row = $st->fetch()) {
            $item = api_decode_payload($row['payload'] ?? null);
            if ($item) {
                $list[] = $item;
            }
        }
        api_ok($list);
    }

    if ($method === 'POST' || $method === 'PUT') {
        $item = api_read_json();
        $id = trim((string) ($item['id'] ?? ''));
        if ($id === '') {
            api_fail(400, 'Campo id é obrigatório.');
        }
        $code = trim((string) ($item['code'] ?? ''));
        $courseId = trim((string) ($item['courseId'] ?? ''));
        $updatedAt = trim((string) ($item['updatedAt'] ?? ''));
        if ($updatedAt === '') {
            $updatedAt = gmdate('Y-m-d\TH:i:s.000\Z');
            $item['updatedAt'] = $updatedAt;
        }
        $payload = api_encode_payload($item);

        $st = $pdo->prepare(
            'INSERT INTO curriculum_structures (id, code, course_id, updated_at, payload)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               code = VALUES(code),
               course_id = VALUES(course_id),
               updated_at = VALUES(updated_at),
               payload = VALUES(payload)'
        );
        $st->execute([
            $id,
            $code,
            $courseId,
            date('Y-m-d H:i:s', strtotime($updatedAt) ?: time()),
            $payload,
        ]);
        api_ok($item);
    }

    if ($method === 'DELETE') {
        $id = trim((string) ($_GET['id'] ?? ''));
        if ($id === '') {
            api_fail(400, 'Informe ?id=');
        }
        $st = $pdo->prepare('DELETE FROM curriculum_structures WHERE id = ?');
        $st->execute([$id]);
        api_ok(['deleted' => $id, 'rows' => $st->rowCount()]);
    }

    api_fail(405, 'Método não permitido.');
} catch (Throwable $e) {
    api_fail(500, $e->getMessage());
}
