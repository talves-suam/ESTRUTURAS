<?php
/**
 * Entrada PHP para hosts que exigem index na raiz (padrão UNISUAM / Apache).
 * Serve o SPA gerado pelo Vite (index.html).
 */
declare(strict_types=1);

$htmlFile = __DIR__ . DIRECTORY_SEPARATOR . 'index.html';

if (!is_file($htmlFile)) {
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Aplicação não publicada. Na pasta do projeto, rode: npm run build\n";
    echo "Em seguida envie o conteúdo da pasta dist/ para este diretório.\n";
    exit;
}

header('Content-Type: text/html; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('X-Frame-Options: SAMEORIGIN');

readfile($htmlFile);
