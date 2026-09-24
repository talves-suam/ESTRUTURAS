<?php
/** Logout. */
declare(strict_types=1);

require dirname(__DIR__) . '/bootstrap.php';
require dirname(__DIR__) . '/auth_lib.php';

if (api_method() !== 'POST') {
    api_fail(405, 'Use POST.');
}
api_clear_user();
api_ok(['loggedOut' => true]);
