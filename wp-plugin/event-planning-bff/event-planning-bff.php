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
		const SLOTS_OPTION          = 'event_planning_slots';
		const SIGNUPS_OPTION        = 'event_planning_signups';
		const BFF_USER_HEADER       = 'x-wp-user-id';
		const EVENT_ID             = 1;
		const EVENT_NAME           = 'Event Planning Demo';

		final public static function init() {
			add_action( 'rest_api_init', [ __CLASS__, 'register_routes' ] );
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
			// Reset slot(s)
			self::set_slot( 12, [
				'id'        => 12,
				'capacity'  => 10,
				'remaining' => 5,
				'maxQty'    => 3,
				'locked'    => false,
				'cutoff'    => null,
			]);

			// Clear signups
			self::set_signups( [] );

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

			$signups = self::get_signups();
			foreach ( $signups as $existing ) {
				if ( $existing['slot_id'] === $slot_id && $existing['identity_key'] === $identity ) {
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

			$slot['remaining'] -= $qty;
			self::update_slot( $slot_id, $slot );

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

			$signups[] = $signup;
			self::set_signups( $signups );

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

			$signups = self::get_signups();
			$signup  = null;
			$index   = null;
			foreach ( $signups as $i => $candidate ) {
				if ( $candidate['id'] === $signup_id ) {
					$signup = $candidate;
					$index  = $i;
					break;
				}
			}

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
				$slot['remaining'] += (int) $signup['qty'];
				self::update_slot( $slot_id, $slot );
			}

			$signup['status']     = 'canceled';
			$signup['can_cancel'] = false;
			$signup['can_edit']   = false;
			$signup['can_claim']  = false;
			$signups[ $index ]    = $signup;

			self::set_signups( $signups );

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
			$slots = self::get_slots();
			if ( isset( $slots[ $slot_id ] ) ) {
				return $slots[ $slot_id ];
			}

			return null;
		}

		private static function update_slot( $slot_id, $slot ) {
			$slots              = self::get_slots();
			$slots[ $slot_id ] = $slot;
			update_option( self::SLOTS_OPTION, $slots );
		}

		private static function set_slot( $slot_id, $slot ) {
			self::update_slot( $slot_id, $slot );
		}

		private static function get_slots() {
			$slots = get_option( self::SLOTS_OPTION );
			if ( ! is_array( $slots ) ) {
				$slots = [
					12 => [
						'id'        => 12,
						'capacity'  => 10,
						'remaining' => 5,
						'maxQty'    => 3,
						'cutoff'    => strtotime( '2026-12-31T23:59:59Z' ),
						'locked'    => false,
					],
				];
				update_option( self::SLOTS_OPTION, $slots );
			}
			return $slots;
		}

		private static function get_signups() {
			$signups = get_option( self::SIGNUPS_OPTION );
			if ( ! is_array( $signups ) ) {
				$signups = [];
			}
			return $signups;
		}

		private static function set_signups( $signups ) {
			update_option( self::SIGNUPS_OPTION, $signups );
		}
	}
}

Event_Planning_BFF::init();
