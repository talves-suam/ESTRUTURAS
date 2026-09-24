<?php
/** Config pública (sem segredos) — Client ID Google para o botão de login. */
declare(strict_types=1);

require dirname(__DIR__) . '/bootstrap.php';
require dirname(__DIR__) . '/auth_lib.php';

$c = api_config();
api_ok([
    'googleClientId' => trim((string) ($c['google_client_id'] ?? '')),
    'allowedEmailDomain' => api_allowed_email_domain(),
    'allowLocalLogin' => api_allow_local_login(),
]);
