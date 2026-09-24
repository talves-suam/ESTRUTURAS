<?php
/** Login Google — POST { credential: <JWT do GIS> } */
declare(strict_types=1);

require dirname(__DIR__) . '/bootstrap.php';
require dirname(__DIR__) . '/auth_lib.php';

if (api_method() !== 'POST') {
    api_fail(405, 'Use POST.');
}

$body = api_read_json();
$credential = trim((string) ($body['credential'] ?? $body['idToken'] ?? ''));
if ($credential === '') {
    api_fail(400, 'Informe o credential (ID token) do Google.');
}

$user = api_verify_google_id_token($credential);
api_set_user($user);
api_ok($user);
