<?php
// phpcs:disable WordPress.Files.FileName

$wp_tests_dir = getenv( 'WP_TESTS_DIR' );
if ( ! $wp_tests_dir ) {
	$wp_tests_dir = getenv( 'WP_TESTS_DIR_PATH' );
}

if ( ! $wp_tests_dir ) {
	die( "WP_TESTS_DIR environment variable is not defined.\n" );
}

require_once $wp_tests_dir . '/includes/functions.php';

tests_add_filter( 'muplugins_loaded', function () {
	require_once dirname( __DIR__ ) . '/event-planning-bff.php';
} );

require_once $wp_tests_dir . '/includes/bootstrap.php';
