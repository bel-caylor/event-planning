<?php

use PHPUnit\Framework\Assert;

class Event_Planning_Schema_Upgrade_Test extends WP_UnitTestCase {
	protected $slots_table;
	protected $signups_table;

	public function setUp(): void {
		parent::setUp();
		global $wpdb;

		$this->slots_table   = $wpdb->prefix . 'ep_slots';
		$this->signups_table = $wpdb->prefix . 'ep_signups';

		$wpdb->query( "DROP TABLE IF EXISTS {$this->slots_table}" );
		$wpdb->query( "DROP TABLE IF EXISTS {$this->signups_table}" );

		update_option( Event_Planning_BFF::SCHEMA_OPTION, '0' );
	}

	public function tearDown(): void {
		global $wpdb;
		$wpdb->query( "DROP TABLE IF EXISTS {$this->slots_table}" );
		$wpdb->query( "DROP TABLE IF EXISTS {$this->signups_table}" );
		parent::tearDown();
	}

	public function test_schema_upgrade_creates_tables_and_timezone_column() {
		global $wpdb;

		Event_Planning_BFF::maybe_upgrade_schema();

		$this->assertSame( Event_Planning_BFF::SCHEMA_VERSION, get_option( Event_Planning_BFF::SCHEMA_OPTION ) );

		$slots_exists = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $this->slots_table ) );
		$this->assertNotEmpty( $slots_exists, 'Slots table should exist after upgrade' );

		$signups_exists = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $this->signups_table ) );
		$this->assertNotEmpty( $signups_exists, 'Signups table should exist after upgrade' );

		$column = $wpdb->get_row(
			$wpdb->prepare( "SHOW COLUMNS FROM {$this->slots_table} LIKE %s", 'timezone' )
		);
		$this->assertNotEmpty( $column, 'Timezone column should exist after schema migration' );
	}
}
