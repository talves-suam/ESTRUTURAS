<?php
/**
 * Login local (desenvolvimento / intranet).
 * POST { email|user, password }
 * Só se allow_local_login=true no config OU request de localhost.
 */
declare(strict_types=1);

require dirname(__DIR__) . '/bootstrap.php';
require dirname(__DIR__) . '/auth_lib.php';

if (api_method() !== 'POST') {
    api_fail(405, 'Use POST.');
}
if (!api_allow_local_login()) {
    api_fail(403, 'Login local desabilitado neste ambiente. Use Google corporativo.');
}

$body = api_read_json();
$userOrEmail = strtolower(trim((string) ($body['email'] ?? $body['user'] ?? '')));
$password = (string) ($body['password'] ?? '');

$c = api_config();
$expected = (string) ($c['local_dev_password'] ?? '123456');
$domain = api_allowed_email_domain();

if ($userOrEmail === 'suam') {
    $userOrEmail = 'suam@' . $domain;
}
if ($userOrEmail !== '' && !str_contains($userOrEmail, '@')) {
    $userOrEmail .= '@' . $domain;
}

if (!api_is_unisuam_email($userOrEmail)) {
    api_fail(400, 'Use um e-mail @' . $domain . '.');
}
if (!hash_equals($expected, $password)) {
    api_fail(401, 'Senha incorreta.');
}

$user = [
    'uid' => 'local:' . $userOrEmail,
    'email' => $userOrEmail,
    'displayName' => explode('@', $userOrEmail)[0],
    'photoURL' => null,
    'isLocalBypass' => true,
];
api_set_user($user);
api_ok($user);
