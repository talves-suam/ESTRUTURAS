<?php
/**
 * Sessão PHP + auth Google (@unisuam.edu.br) e login local de desenvolvimento.
 */
declare(strict_types=1);

function api_start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_name('estruturas_sess');
    session_start();
}

function api_allowed_email_domain(): string
{
    $c = api_config();
    $d = strtolower(trim((string) ($c['allowed_email_domain'] ?? 'unisuam.edu.br')));
    return $d !== '' ? $d : 'unisuam.edu.br';
}

function api_is_unisuam_email(string $email): bool
{
    $email = strtolower(trim($email));
    $domain = api_allowed_email_domain();
    return $email !== '' && str_ends_with($email, '@' . $domain);
}

function api_is_local_request(): bool
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    return in_array($ip, ['127.0.0.1', '::1'], true);
}

function api_allow_local_login(): bool
{
    $c = api_config();
    if (!empty($c['allow_local_login'])) {
        return true;
    }
    return api_is_local_request();
}

function api_current_user(): ?array
{
    api_start_session();
    $u = $_SESSION['user'] ?? null;
    if (!is_array($u) || empty($u['email']) || !api_is_unisuam_email((string) $u['email'])) {
        return null;
    }
    return [
        'uid' => (string) ($u['uid'] ?? ('php:' . $u['email'])),
        'email' => (string) $u['email'],
        'displayName' => (string) ($u['displayName'] ?? $u['email']),
        'photoURL' => isset($u['photoURL']) ? (string) $u['photoURL'] : null,
        'isLocalBypass' => !empty($u['isLocalBypass']),
    ];
}

function api_set_user(array $user): void
{
    api_start_session();
    $_SESSION['user'] = $user;
}

function api_clear_user(): void
{
    api_start_session();
    unset($_SESSION['user']);
}

/** Exige sessão válida (GET/POST de dados). health/install/auth ficam livres. */
function api_require_auth(): array
{
    $user = api_current_user();
    if (!$user) {
        api_fail(401, 'Faça login com a conta corporativa @' . api_allowed_email_domain() . '.');
    }
    return $user;
}

/**
 * Valida ID token do Google (GIS) via tokeninfo.
 * Em produção com muitos logins, prefira validar JWT com certificados Google.
 */
function api_verify_google_id_token(string $credential): array
{
    $c = api_config();
    $clientId = trim((string) ($c['google_client_id'] ?? ''));
    if ($clientId === '') {
        api_fail(500, 'google_client_id não configurado em api/config.php. Crie um Client ID OAuth (tipo Web) no Google Cloud Console.');
    }

    $url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($credential);
    $raw = null;
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 12,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $raw = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($raw === false || $code >= 400) {
            api_fail(401, 'Token Google inválido ou expirado.');
        }
    } else {
        $ctx = stream_context_create(['http' => ['timeout' => 12]]);
        $raw = @file_get_contents($url, false, $ctx);
        if ($raw === false) {
            api_fail(401, 'Não foi possível validar o token Google no servidor.');
        }
    }

    $payload = json_decode($raw, true);
    if (!is_array($payload)) {
        api_fail(401, 'Resposta inválida do Google tokeninfo.');
    }

    $aud = (string) ($payload['aud'] ?? '');
    if ($aud !== $clientId) {
        api_fail(401, 'Client ID do token não confere com api/config.php.');
    }

    $email = strtolower(trim((string) ($payload['email'] ?? '')));
    $verified = ($payload['email_verified'] ?? '') === 'true' || ($payload['email_verified'] ?? false) === true;
    if ($email === '' || !$verified) {
        api_fail(401, 'E-mail Google não verificado.');
    }
    if (!api_is_unisuam_email($email)) {
        api_fail(403, 'Acesso restrito a contas @' . api_allowed_email_domain() . '.');
    }

    $hd = strtolower(trim((string) ($payload['hd'] ?? '')));
    $domain = api_allowed_email_domain();
    if ($hd !== '' && $hd !== $domain) {
        api_fail(403, 'Domínio Google Workspace não autorizado.');
    }

    return [
        'uid' => 'google:' . (string) ($payload['sub'] ?? $email),
        'email' => $email,
        'displayName' => (string) ($payload['name'] ?? explode('@', $email)[0]),
        'photoURL' => isset($payload['picture']) ? (string) $payload['picture'] : null,
        'isLocalBypass' => false,
    ];
}
