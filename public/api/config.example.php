<?php
/**
 * Modelo de configuração MySQL (UNISUAM).
 *
 * 1. Copie este arquivo para config.php (mesma pasta).
 * 2. Preencha host, db, user, pass com os dados da TI.
 * 3. Crie um OAuth Client ID (tipo Web) no Google Cloud Console
 *    e cole em google_client_id (login @unisuam.edu.br).
 * 4. Envie config.php no GitLab PRIVADO da instituição
 *    OU peça à TI para criar config.php só no servidor.
 *
 * NUNCA publique config.php com senha em repositório público.
 */
declare(strict_types=1);

return [
    'host' => 'localhost',
    'port' => 3306,
    'db'   => 'NOME_DO_BANCO',
    'user' => 'USUARIO',
    'pass' => 'SENHA',
    'charset' => 'utf8mb4',

    /** Client ID OAuth Web (Google Cloud → APIs e serviços → Credenciais). */
    'google_client_id' => '',

    'allowed_email_domain' => 'unisuam.edu.br',

    /**
     * Login usuário+senha (só desenvolvimento / testes).
     * Em produção no servidor, deixe false — só Google corporativo.
     * Em localhost o endpoint ainda libera se a origem for 127.0.0.1.
     */
    'allow_local_login' => true,
    'local_dev_password' => '123456',

    /**
     * Token para criar as tabelas uma vez:
     *   .../estruturas/api/install.php?token=SEU_TOKEN
     * Depois esvazie o token.
     */
    'install_token' => 'troque-este-token',
];
