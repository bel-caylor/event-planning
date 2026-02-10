<?php
/**
 * Plugin Name: Event Planning BFF Proxy
 * Description: Bridges WordPress identities and slots to the Event Planning BFF contract.
 * Version: 0.1.0
 * Author: BC Web Studio 
 * License: MIT
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'Event_Planning_BFF' ) ) {
	class Event_Planning_BFF {
		const REST_NAMESPACE        = 'event-planning/v1';
		const SIGNUPS_ROUTE         = '/signups';
		const BFF_USER_HEADER       = 'x-wp-user-id';
		const EVENT_ID             = 1;
		const EVENT_NAME           = 'Event Planning Demo';
		const SCHEMA_VERSION        = '1.1.0';
		const SCHEMA_OPTION         = 'event_planning_schema_version';

		final public static function init() {
			add_action( 'rest_api_init', [ __CLASS__, 'register_routes' ] );
			add_action( 'admin_init', [ __CLASS__, 'maybe_upgrade_schema' ] );
		}

		final public static function activate() {
			self::maybe_upgrade_schema();
		}

		public static function maybe_upgrade_schema() {
			$installed = get_option( self::SCHEMA_OPTION, '0' );
			if ( version_compare( $installed, self::SCHEMA_VERSION, '>=' ) ) {
				return;
			}

			global $wpdb;
			require_once ABSPATH . 'wp-admin/includes/upgrade.php';
			$charset_collate = $wpdb->get_charset_collate();

			if ( version_compare( $installed, '1.0.0', '<' ) ) {
				self::create_base_schema( $charset_collate );
			}

			if ( version_compare( $installed, '1.1.0', '<' ) ) {
				self::add_slot_timezone_column();
			}

			update_option( self::SCHEMA_OPTION, self::SCHEMA_VERSION );
		}

		private static function create_base_schema( $charset_collate ) {
			global $wpdb;

			$slots_table   = self::slots_table();
			$signups_table = self::signups_table();

			$sql = "
CREATE TABLE {$slots_table} (
	id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
	event_id BIGINT(20) UNSIGNED NULL,
	capacity INT UNSIGNED NOT NULL,
	remaining INT UNSIGNED NOT NULL,
	max_qty INT UNSIGNED NULL,
	locked TINYINT(1) NOT NULL DEFAULT 0,
	cutoff_at DATETIME NULL,
	created_at DATETIME NOT NULL,
	updated_at DATETIME NOT NULL,
	PRIMARY KEY  (id),
	KEY event_id (event_id)
) {$charset_collate};

CREATE TABLE {$signups_table} (
	id CHAR(36) NOT NULL,
	slot_id BIGINT(20) UNSIGNED NOT NULL,
	identity_type VARCHAR(20) NOT NULL,
	identity_key VARCHAR(190) NOT NULL,
	qty INT UNSIGNED NOT NULL,
	status VARCHAR(20) NOT NULL,
	created_at DATETIME NOT NULL,
	updated_at DATETIME NOT NULL,
	PRIMARY KEY  (id),
	UNIQUE KEY slot_identity_status (slot_id, identity_key, status),
	KEY slot_id (slot_id),
	KEY identity_key (identity_key)
) {$charset_collate};
";

			dbDelta( $sql );
		}

		private static function add_slot_timezone_column() {
			global $wpdb;
			$table = self::slots_table();
			if ( self::column_exists( $table, 'timezone' ) ) {
				return;
			}

			$wpdb->query(
				"ALTER TABLE {$table} ADD COLUMN timezone VARCHAR(64) NULL AFTER cutoff_at;"
			);
		}

		private static function column_exists( $table, $column ) {
			global $wpdb;
			$column = $wpdb->get_row(
				$wpdb->prepare(
					"SHOW COLUMNS FROM {$table} LIKE %s",
					$column
				)
			);
			return (bool) $column;
		}

		private static function slots_table() {
			global $wpdb;
			return $wpdb->prefix . 'ep_slots';
		}

		private static function signups_table() {
			global $wpdb;
			return $wpdb->prefix . 'ep_signups';
		}

		private static function now_utc() {
			return current_time( 'mysql', true );
		}

		final public static function register_routes() {
			register_rest_route(
				self::REST_NAMESPACE,
				self::SIGNUPS_ROUTE,
				[
				'methods'             => 'POST',
				'callback'            => [ __CLASS__, 'handle_signup' ],
				'permission_callback' => [ __CLASS__, 'has_permission' ],
				]
			);

			register_rest_route(
				self::REST_NAMESPACE,
				self::SIGNUPS_ROUTE . '/(?P<signup_id>[\w-]+)/cancel',
				[
					'methods'             => 'POST',
					'callback'            => [ __CLASS__, 'handle_cancel' ],
					'permission_callback' => [ __CLASS__, 'has_permission' ],
				]
			);

			register_rest_route(
				self::REST_NAMESPACE,
				'/events/(?P<event_id>\d+)',
				[
					'methods'             => 'GET',
					'callback'            => [ __CLASS__, 'handle_event_snapshot' ],
					'permission_callback' => [ __CLASS__, 'has_permission' ],
				]
			);

			if ( self::is_dev_mode() ) {
				register_rest_route(
					self::REST_NAMESPACE,
					'/dev/reset',
					[
						'methods'             => 'POST',
						'callback'            => [ __CLASS__, 'dev_reset' ],
						'permission_callback' => [ __CLASS__, 'dev_permission' ],
					]
				);

				register_rest_route(
					self::REST_NAMESPACE,
					'/dev/slots/(?P<slot_id>\d+)',
					[
						'methods'             => 'POST',
						'callback'            => [ __CLASS__, 'dev_update_slot' ],
						'permission_callback' => [ __CLASS__, 'dev_permission' ],
					]
				);
			}
		}

		public static function dev_reset( WP_REST_Request $request ) {
			global $wpdb;
			$wpdb->query( "DELETE FROM " . self::signups_table() );
			$wpdb->query( "DELETE FROM " . self::slots_table() );

			self::upsert_slot(
				[
					'id'        => 12,
					'event_id'  => self::EVENT_ID,
					'capacity'  => 10,
					'remaining' => 5,
					'maxQty'    => 3,
					'locked'    => false,
					'cutoff'    => null,
				]
			);

			return new WP_REST_Response(
				[ 'ok' => true ],
				200
			);
		}

		public static function dev_update_slot( WP_REST_Request $request ) {
			$slot_id = (int) $request['slot_id'];
			$body    = $request->get_json_params();

			$slot = self::get_slot( $slot_id );
			if ( ! $slot ) {
				return self::error_response( 404, 'SLOT_NOT_FOUND', 'Slot not found.', [] );
			}

			// Allow setting only safe fields for tests
			if ( array_key_exists('remaining', $body) ) $slot['remaining'] = (int) $body['remaining'];
			if ( array_key_exists('locked', $body) ) $slot['locked'] = (bool) $body['locked'];
			if ( array_key_exists('cutoff', $body) ) {
				// Accept cutoff as unix timestamp for simplicity in tests
				$slot['cutoff'] = is_null($body['cutoff']) ? null : (int) $body['cutoff'];
			}

			self::update_slot( $slot_id, $slot );

			return new WP_REST_Response(
				[ 'slot' => $slot ],
				200
			);
		}

		private static function is_dev_mode(): bool {
			// Best practice: WP provides this env type in newer versions.
			$env = function_exists('wp_get_environment_type') ? wp_get_environment_type() : 'production';
			return in_array( $env, [ 'local', 'development' ], true );
		}

		public static function dev_permission( WP_REST_Request $request ): bool {
			if ( ! self::is_dev_mode() ) {
				return false;
			}

			if ( ! defined( 'EVENT_PLANNING_DEV_SECRET' ) || EVENT_PLANNING_DEV_SECRET === '' ) {
				return false;
			}

			$provided = $request->get_header( 'x-ep-dev-secret' );
			return is_string( $provided ) && hash_equals( EVENT_PLANNING_DEV_SECRET, $provided );
		}

		final public static function has_permission( WP_REST_Request $request ) {
			return true;
		}

		private static function resolve_identity_key( WP_REST_Request $request, bool $require_guest_email = false ) {
			$user_id = get_current_user_id();
			if ( $user_id > 0 ) {
				return 'wp:' . $user_id;
			}

			$guest_email = $request->get_param( 'guest_email' );
			if ( ! $guest_email ) {
				$body        = $request->get_json_params();
				$guest_email = $body['guest']['email'] ?? '';
			}

			$guest_email = strtolower( trim( (string) $guest_email ) );

			if ( '' === $guest_email ) {
				return $require_guest_email ? false : null;
			}

			return 'guest:' . $guest_email;
		}

		final public static function handle_signup( WP_REST_Request $request ) {
			$body     = $request->get_json_params();
			$slot_id  = isset( $body['slot_id'] ) ? (int) $body['slot_id'] : null;
			$qty      = isset( $body['qty'] ) ? $body['qty'] : null;
			$guest    = isset( $body['guest'] ) ? $body['guest'] : [];
			$is_wp    = get_current_user_id() > 0;
			$identity = $is_wp ? 'wp:' . get_current_user_id() : 'guest:' . strtolower( $guest['email'] ?? '' );

			$field_errors = self::validate_request( $slot_id, $qty, $guest, $is_wp );
			if ( ! empty( $field_errors ) ) {
				return self::error_response( 422, 'VALIDATION_FAILED', 'Please correct the highlighted fields.', [ 'field_errors' => $field_errors ] );
			}

			$slot = self::get_slot( $slot_id );

			if ( ! $slot ) {
				return self::error_response( 422, 'VALIDATION_FAILED', 'slot_id is invalid', [ 'slot_id' => 'slot_id is invalid' ] );
			}

			$existing = self::find_confirmed_signup_by_identity( $slot_id, $identity );
			if ( $existing ) {
				return rest_ensure_response(
					[
						'data'   => [
							'signup'       => $existing,
							'availability' => self::availability_snapshot( $slot_id ),
						],
						'errors' => [],
					]
				);
			}

			if ( $slot['locked'] ) {
				return self::error_with_snapshot( 403, 'ACTION_NOT_ALLOWED', 'This slot is locked.', $slot_id, [ 'reason' => 'slot_locked' ] );
			}

			if ( isset( $slot['cutoff'] ) && current_time( 'timestamp' ) > $slot['cutoff'] ) {
				return self::error_with_snapshot( 403, 'CUTOFF_PASSED', 'Signups are closed for this slot.', $slot_id, [ 'reason' => 'cutoff_passed' ] );
			}

			if ( $slot['remaining'] < $qty ) {
				return self::error_with_snapshot( 409, 'SLOT_FULL', 'That slot is no longer available.', $slot_id, [ 'reason' => 'slot_full', 'remaining' => $slot['remaining'] ] );
			}

			if ( isset( $slot['maxQty'] ) && (int) $qty > $slot['maxQty'] ) {
				return self::error_response( 422, 'VALIDATION_FAILED', 'Quantity exceeds allowed maximum.', [ 'qty' => "qty cannot exceed {$slot['maxQty']}" ] );
			}

			$decremented = self::decrement_slot_remaining( $slot_id, (int) $qty );
			if ( ! $decremented ) {
				$slot = self::get_slot( $slot_id );
				return self::error_with_snapshot( 409, 'SLOT_FULL', 'That slot is no longer available.', $slot_id, [ 'reason' => 'slot_full', 'remaining' => $slot ? $slot['remaining'] : 0 ] );
			}

			$signup = [
				'id'           => wp_generate_uuid4(),
				'slot_id'      => $slot_id,
				'qty'          => (int) $qty,
				'identity_type'=> $is_wp ? 'wp_user' : 'guest',
				'identity_key' => $identity,
				'status'       => 'confirmed',
				'can_edit'     => true,
				'can_cancel'   => true,
				'can_claim'    => ! $is_wp,
			];

			self::insert_signup( $signup );

			$response = rest_ensure_response(
				[
					'data'   => [
						'signup'       => $signup,
						'availability' => self::availability_snapshot( $slot_id ),
					],
					'errors' => [],
				]
			);

			$response->set_status( 200 );
			return $response;
		}

		final public static function handle_event_snapshot( WP_REST_Request $request ) {
			$event_id = (int) $request['event_id'];
			if ( $event_id !== self::EVENT_ID ) {
				return self::error_response( 404, 'EVENT_NOT_FOUND', 'Event not found.', [] );
			}

			$slots = [];
			foreach ( self::get_slots() as $slot ) {
				$slots[] = array_merge(
					$slot,
					[
						'availability' => self::availability_snapshot( $slot['id'] ),
					]
				);
			}

			$identity_key = self::resolve_identity_key( $request );
			$my_signups   = [];

			if ( $identity_key ) {
				foreach ( self::get_signups() as $signup ) {
					if ( $signup['identity_key'] === $identity_key ) {
						$my_signups[] = $signup;
					}
				}
			}

			return rest_ensure_response(
				[
					'data' => [
						'event'      => [
							'id'    => self::EVENT_ID,
							'name'  => self::EVENT_NAME,
							'slots' => $slots,
						],
						'my_signups' => $my_signups,
					],
					'errors' => [],
				]
			);
		}

		final public static function handle_cancel( WP_REST_Request $request ) {
			$signup_id    = $request['signup_id'];
			$identity_key = self::resolve_identity_key( $request, true );

			if ( false === $identity_key ) {
				return self::error_response( 422, 'VALIDATION_FAILED', 'guest.email is required for unauthenticated requests', [ 'email' => 'guest.email is required for unauthenticated requests' ] );
			}

			$signup = self::get_signup_by_id( $signup_id );

			if ( ! $signup ) {
				return self::error_response( 404, 'SIGNUP_NOT_FOUND', 'Signup not found.', [] );
			}

			if ( $signup['identity_key'] !== $identity_key ) {
				return self::error_with_snapshot( 403, 'NOT_OWNER', 'You do not own that signup.', $signup['slot_id'] );
			}

			if ( $signup['status'] === 'canceled' ) {
				return self::error_with_snapshot( 409, 'SIGNUP_ALREADY_CANCELED', 'This signup has already been canceled.', $signup['slot_id'] );
			}

			$slot_id = $signup['slot_id'];
			$slot    = self::get_slot( $slot_id );
			if ( $slot ) {
				self::increment_slot_remaining( $slot_id, (int) $signup['qty'] );
			}

			$signup['status']     = 'canceled';
			$signup['can_cancel'] = false;
			$signup['can_edit']   = false;
			$signup['can_claim']  = false;
			self::mark_signup_canceled( $signup_id );

			return rest_ensure_response(
				[
					'data'   => [
						'signup'       => $signup,
						'availability' => self::availability_snapshot( $slot_id ),
					],
					'errors' => [],
				]
			);
		}

		private static function validate_request( $slot_id, $qty, $guest, $is_wp ) {
			$errors = [];

			if ( ! $slot_id ) {
				$errors['slot_id'] = 'slot_id is required';
			}

			if ( ! isset( $qty ) ) {
				$errors['qty'] = 'qty is required';
			} elseif ( ! is_numeric( $qty ) || $qty <= 0 ) {
				$errors['qty'] = 'qty must be greater than zero';
			}

			if ( ! $is_wp ) {
				if ( empty( $guest['email'] ) ) {
					$errors['email'] = 'guest.email is required for unauthenticated requests';
				}
				if ( empty( $guest['name'] ) ) {
					$errors['name'] = 'guest.name is required for unauthenticated requests';
				}
			}

			return $errors;
		}

		private static function availability_snapshot( $slot_id, $overrides = [] ) {
			$slot = self::get_slot( $slot_id );
			if ( ! $slot ) {
				return array_merge(
					[
						'slot_id'    => $slot_id,
						'remaining'  => 0,
						'can_signup' => false,
						'reason'     => 'slot_missing',
					],
					$overrides
				);
			}

			return array_merge(
				[
					'slot_id'    => $slot['id'],
					'remaining'  => max( 0, $slot['remaining'] ),
					'can_signup' => $slot['remaining'] > 0,
					'reason'     => null,
				],
				$overrides
			);
		}

		private static function error_response( $status, $code, $message, $details = [] ) {
			$response = rest_ensure_response(
				[
					'errors' => [
						[
							'code'      => $code,
							'message'   => $message,
							'details'   => $details,
							'retryable' => false,
						],
					],
				]
			);

			$response->set_status( $status );
			return $response;
		}

		private static function error_with_snapshot( $status, $code, $message, $slot_id, $overrides = [] ) {
			$response = self::error_response( $status, $code, $message );
			$data     = (array) $response->get_data();
			$data['snapshot'] = [
				'availability' => self::availability_snapshot( $slot_id, array_merge( [ 'can_signup' => false ], $overrides ) ),
			];
			$response->set_data( $data );
			return $response;
		}

		private static function get_slot( $slot_id ) {
			global $wpdb;
			$row = $wpdb->get_row(
				$wpdb->prepare(
					"SELECT id, event_id, capacity, remaining, max_qty, locked, cutoff_at FROM " . self::slots_table() . " WHERE id = %d LIMIT 1",
					$slot_id
				),
				ARRAY_A
			);
			if ( ! $row ) {
				return null;
			}

			return [
				'id'        => (int) $row['id'],
				'event_id'  => isset( $row['event_id'] ) ? (int) $row['event_id'] : null,
				'capacity'  => (int) $row['capacity'],
				'remaining' => (int) $row['remaining'],
				'maxQty'    => is_null( $row['max_qty'] ) ? null : (int) $row['max_qty'],
				'locked'    => (bool) $row['locked'],
				'cutoff'    => is_null( $row['cutoff_at'] ) ? null : strtotime( $row['cutoff_at'] . ' UTC' ),
			];
		}

		private static function upsert_slot( $slot ) {
			global $wpdb;
			$now = self::now_utc();
			$data = [
				'id'        => (int) $slot['id'],
				'event_id'  => $slot['event_id'] ?? null,
				'capacity'  => (int) $slot['capacity'],
				'remaining' => (int) $slot['remaining'],
				'max_qty'   => array_key_exists( 'maxQty', $slot ) ? $slot['maxQty'] : null,
				'locked'    => ! empty( $slot['locked'] ) ? 1 : 0,
				'cutoff_at' => isset( $slot['cutoff'] ) && ! is_null( $slot['cutoff'] ) ? gmdate( 'Y-m-d H:i:s', (int) $slot['cutoff'] ) : null,
				'created_at'=> $now,
				'updated_at'=> $now,
			];

			$existing = self::get_slot( (int) $slot['id'] );
			if ( $existing ) {
				unset( $data['created_at'] );
				return (bool) $wpdb->update(
					self::slots_table(),
					$data,
					[ 'id' => (int) $slot['id'] ],
					[ '%d', '%d', '%d', '%d', '%s', '%d', '%s', '%s' ],
					[ '%d' ]
				);
			}

			return (bool) $wpdb->insert(
				self::slots_table(),
				$data,
				[ '%d', '%d', '%d', '%d', '%s', '%d', '%s', '%s', '%s' ]
			);
		}

		private static function update_slot( $slot_id, $slot ) {
			global $wpdb;
			$data = [];
			$formats = [];

			if ( array_key_exists( 'capacity', $slot ) ) {
				$data['capacity'] = (int) $slot['capacity'];
				$formats[] = '%d';
			}
			if ( array_key_exists( 'remaining', $slot ) ) {
				$data['remaining'] = (int) $slot['remaining'];
				$formats[] = '%d';
			}
			if ( array_key_exists( 'maxQty', $slot ) ) {
				$data['max_qty'] = $slot['maxQty'];
				$formats[] = '%s';
			}
			if ( array_key_exists( 'locked', $slot ) ) {
				$data['locked'] = ! empty( $slot['locked'] ) ? 1 : 0;
				$formats[] = '%d';
			}
			if ( array_key_exists( 'cutoff', $slot ) ) {
				$data['cutoff_at'] = is_null( $slot['cutoff'] ) ? null : gmdate( 'Y-m-d H:i:s', (int) $slot['cutoff'] );
				$formats[] = '%s';
			}
			$data['updated_at'] = self::now_utc();
			$formats[] = '%s';

			return (bool) $wpdb->update(
				self::slots_table(),
				$data,
				[ 'id' => (int) $slot_id ],
				$formats,
				[ '%d' ]
			);
		}

		private static function get_slots() {
			global $wpdb;
			$rows = $wpdb->get_results(
				"SELECT id, event_id, capacity, remaining, max_qty, locked, cutoff_at FROM " . self::slots_table() . " ORDER BY id ASC",
				ARRAY_A
			);
			if ( empty( $rows ) ) {
				self::upsert_slot(
					[
						'id'        => 12,
						'event_id'  => self::EVENT_ID,
						'capacity'  => 10,
						'remaining' => 5,
						'maxQty'    => 3,
						'locked'    => false,
						'cutoff'    => strtotime( '2026-12-31T23:59:59Z' ),
					]
				);
				$rows = $wpdb->get_results(
					"SELECT id, event_id, capacity, remaining, max_qty, locked, cutoff_at FROM " . self::slots_table() . " ORDER BY id ASC",
					ARRAY_A
				);
			}

			$slots = [];
			foreach ( $rows as $row ) {
				$slots[] = [
					'id'        => (int) $row['id'],
					'event_id'  => isset( $row['event_id'] ) ? (int) $row['event_id'] : null,
					'capacity'  => (int) $row['capacity'],
					'remaining' => (int) $row['remaining'],
					'maxQty'    => is_null( $row['max_qty'] ) ? null : (int) $row['max_qty'],
					'locked'    => (bool) $row['locked'],
					'cutoff'    => is_null( $row['cutoff_at'] ) ? null : strtotime( $row['cutoff_at'] . ' UTC' ),
				];
			}
			return $slots;
		}

		private static function get_signups() {
			global $wpdb;
			$rows = $wpdb->get_results(
				"SELECT id, slot_id, identity_type, identity_key, qty, status FROM " . self::signups_table(),
				ARRAY_A
			);
			$signups = [];
			foreach ( $rows as $row ) {
				$signups[] = [
					'id'           => $row['id'],
					'slot_id'      => (int) $row['slot_id'],
					'identity_type'=> $row['identity_type'],
					'identity_key' => $row['identity_key'],
					'qty'          => (int) $row['qty'],
					'status'       => $row['status'],
					'can_edit'     => $row['status'] === 'confirmed',
					'can_cancel'   => $row['status'] === 'confirmed',
					'can_claim'    => $row['identity_type'] === 'guest' && $row['status'] === 'confirmed',
				];
			}
			return $signups;
		}

		private static function find_confirmed_signup_by_identity( $slot_id, $identity_key ) {
			global $wpdb;
			$row = $wpdb->get_row(
				$wpdb->prepare(
					"SELECT id, slot_id, identity_type, identity_key, qty, status FROM " . self::signups_table() . " WHERE slot_id = %d AND identity_key = %s AND status = %s LIMIT 1",
					$slot_id,
					$identity_key,
					'confirmed'
				),
				ARRAY_A
			);
			if ( ! $row ) {
				return null;
			}
			return [
				'id'           => $row['id'],
				'slot_id'      => (int) $row['slot_id'],
				'identity_type'=> $row['identity_type'],
				'identity_key' => $row['identity_key'],
				'qty'          => (int) $row['qty'],
				'status'       => $row['status'],
				'can_edit'     => true,
				'can_cancel'   => true,
				'can_claim'    => $row['identity_type'] === 'guest',
			];
		}

		private static function insert_signup( $signup ) {
			global $wpdb;
			$now = self::now_utc();
			return (bool) $wpdb->insert(
				self::signups_table(),
				[
					'id'           => $signup['id'],
					'slot_id'      => (int) $signup['slot_id'],
					'identity_type'=> $signup['identity_type'],
					'identity_key' => $signup['identity_key'],
					'qty'          => (int) $signup['qty'],
					'status'       => $signup['status'],
					'created_at'   => $now,
					'updated_at'   => $now,
				],
				[ '%s', '%d', '%s', '%s', '%d', '%s', '%s', '%s' ]
			);
		}

		private static function get_signup_by_id( $signup_id ) {
			global $wpdb;
			$row = $wpdb->get_row(
				$wpdb->prepare(
					"SELECT id, slot_id, identity_type, identity_key, qty, status FROM " . self::signups_table() . " WHERE id = %s LIMIT 1",
					$signup_id
				),
				ARRAY_A
			);
			if ( ! $row ) {
				return null;
			}
			return [
				'id'           => $row['id'],
				'slot_id'      => (int) $row['slot_id'],
				'identity_type'=> $row['identity_type'],
				'identity_key' => $row['identity_key'],
				'qty'          => (int) $row['qty'],
				'status'       => $row['status'],
				'can_edit'     => $row['status'] === 'confirmed',
				'can_cancel'   => $row['status'] === 'confirmed',
				'can_claim'    => $row['identity_type'] === 'guest' && $row['status'] === 'confirmed',
			];
		}

		private static function mark_signup_canceled( $signup_id ) {
			global $wpdb;
			return (bool) $wpdb->update(
				self::signups_table(),
				[
					'status'     => 'canceled',
					'updated_at' => self::now_utc(),
				],
				[ 'id' => $signup_id ],
				[ '%s', '%s' ],
				[ '%s' ]
			);
		}

		private static function decrement_slot_remaining( $slot_id, $qty ) {
			global $wpdb;
			$updated = $wpdb->query(
				$wpdb->prepare(
					"UPDATE " . self::slots_table() . " SET remaining = remaining - %d, updated_at = %s WHERE id = %d AND remaining >= %d",
					$qty,
					self::now_utc(),
					$slot_id,
					$qty
				)
			);
			return $updated > 0;
		}

		private static function increment_slot_remaining( $slot_id, $qty ) {
			global $wpdb;
			return (bool) $wpdb->query(
				$wpdb->prepare(
					"UPDATE " . self::slots_table() . " SET remaining = remaining + %d, updated_at = %s WHERE id = %d",
					$qty,
					self::now_utc(),
					$slot_id
				)
			);
		}
	}
}

register_activation_hook( __FILE__, [ 'Event_Planning_BFF', 'activate' ] );
Event_Planning_BFF::init();
