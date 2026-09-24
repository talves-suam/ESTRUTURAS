<?php
/**
 * PDO + respostas JSON + limpeza de payload (economiza espaço).
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function api_config(): array
{
    static $cfg = null;
    if ($cfg !== null) {
        return $cfg;
    }
    $path = __DIR__ . DIRECTORY_SEPARATOR . 'config.php';
    if (!is_file($path)) {
        api_fail(500, 'Falta api/config.php. Copie config.example.php e preencha os dados do MySQL.');
    }
    /** @var array $cfg */
    $cfg = require $path;
    if (empty($cfg['db']) || empty($cfg['user'])) {
        api_fail(500, 'Preencha db, user e pass em api/config.php com os dados da TI.');
    }
    return $cfg;
}

function api_pdo(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $c = api_config();
    $host = (string) ($c['host'] ?? 'localhost');
    $port = (int) ($c['port'] ?? 3306);
    $db = (string) $c['db'];
    $charset = (string) ($c['charset'] ?? 'utf8mb4');
    $dsn = "mysql:host={$host};port={$port};dbname={$db};charset={$charset}";
    try {
        $pdo = new PDO($dsn, (string) $c['user'], (string) ($c['pass'] ?? ''), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (Throwable $e) {
        api_fail(500, 'Não conectou no MySQL. Confira host/db/user/pass em config.php. Detalhe: ' . $e->getMessage());
    }
    return $pdo;
}

function api_fail(int $code, string $message): void
{
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

function api_ok(mixed $data = null, int $code = 200): void
{
    http_response_code($code);
    echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

function api_read_json(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        api_fail(400, 'JSON inválido no corpo da requisição.');
    }
    return $decoded;
}

function api_method(): string
{
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
}

function api_is_heavy_data_url(string $value): bool
{
    return strncmp($value, 'data:', 5) === 0 && strlen($value) > 8000;
}

/**
 * Remove data:URLs grandes (PDF/imagem embutidos) — PDFs ficam no Google Drive.
 * Mantém links http(s) e metadados.
 */
function api_strip_heavy(mixed $value): mixed
{
    if (is_string($value)) {
        return api_is_heavy_data_url($value) ? '' : $value;
    }
    if (is_array($value)) {
        $out = [];
        foreach ($value as $k => $child) {
            if ($k === 'pdfUrl' && is_string($child) && api_is_heavy_data_url($child)) {
                $out['pdfUrl'] = '';
                $out['pdfHostedLocally'] = true;
                continue;
            }
            $out[$k] = api_strip_heavy($child);
        }
        return $out;
    }
    return $value;
}

function api_encode_payload(array $item): string
{
    $slim = api_strip_heavy($item);
    $json = json_encode($slim, JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        api_fail(400, 'Não foi possível serializar o documento.');
    }
    // ~1 MB de folga no MEDIUMTEXT; avisamos cedo
    if (strlen($json) > 900000) {
        api_fail(413, 'Documento grande demais após limpeza (~' . (int) round(strlen($json) / 1024) . ' KB). Use links do Drive nas DCNs.');
    }
    return $json;
}

function api_decode_payload(?string $json): ?array
{
    if ($json === null || $json === '') {
        return null;
    }
    $decoded = json_decode($json, true);
    return is_array($decoded) ? $decoded : null;
}
