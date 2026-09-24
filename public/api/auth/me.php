<?php
/** Sessão atual. */
declare(strict_types=1);

require dirname(__DIR__) . '/bootstrap.php';
require dirname(__DIR__) . '/auth_lib.php';

api_ok(api_current_user());
