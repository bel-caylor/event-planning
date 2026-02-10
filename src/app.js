const express = require('express');
const { v4: uuidv4 } = require('uuid');

const createDefaultSlots = () => {
  return new Map([
    [
      12,
      {
        id: 12,
        capacity: 10,
        remaining: 5,
        maxQty: 3,
        cutoff: new Date('2026-12-31T23:59:59Z'),
        locked: false
      }
    ]
  ]);
};

const state = {
  slots: createDefaultSlots(),
  signups: []
};

const resetState = () => {
  state.slots = createDefaultSlots();
  state.signups = [];
};

const availabilitySnapshot = (slotId, overrides = {}) => {
  const slot = state.slots.get(slotId);
  if (!slot) {
    return {
      slot_id: slotId,
      remaining: 0,
      can_signup: false,
      reason: 'slot_missing',
      ...overrides
    };
  }

  const now = new Date();
  if (slot.cutoff && now > slot.cutoff) {
    return {
      slot_id: slot.id,
      remaining: slot.remaining,
      can_signup: false,
      reason: 'cutoff_passed',
      ...overrides
    };
  }

  if (slot.remaining <= 0) {
    return {
      slot_id: slot.id,
      remaining: 0,
      can_signup: false,
      reason: 'slot_full',
      ...overrides
    };
  }

  return {
    slot_id: slot.id,
    remaining: slot.remaining,
    can_signup: true,
    reason: null,
    ...overrides
  };
};

const validationError = (fieldErrors) => {
  return {
    errors: [
      {
        code: 'VALIDATION_FAILED',
        message: 'Please correct the highlighted fields.',
        details: { field_errors: fieldErrors },
        retryable: false
      }
    ]
  };
};

const createApp = () => {
  const app = express();
  app.use(express.json());

  app.post('/signups', (req, res) => {
    const { slot_id, qty, guest } = req.body || {};
    const isWpUser = Boolean(req.headers['x-wp-user-id']);
    const identityType = isWpUser ? 'wp_user' : 'guest';
    const slot = state.slots.get(slot_id);
    const now = new Date();

    const fieldErrors = {};

    if (!slot_id) {
      fieldErrors.slot_id = 'slot_id is required';
    }

    if (!slot) {
      fieldErrors.slot_id = 'slot_id is invalid';
    }

    if (qty == null) {
      fieldErrors.qty = 'qty is required';
    } else if (typeof qty !== 'number') {
      fieldErrors.qty = 'qty must be a number';
    } else if (qty <= 0) {
      fieldErrors.qty = 'qty must be greater than zero';
    } else if (slot && qty > slot.maxQty) {
      fieldErrors.qty = `qty cannot exceed ${slot.maxQty}`;
    }

    if (!isWpUser) {
      if (!guest || !guest.email) {
        fieldErrors.email = 'guest.email is required for unauthenticated requests';
      }
      if (!guest || !guest.name) {
        fieldErrors.name = 'guest.name is required for unauthenticated requests';
      }
    }

    if (Object.keys(fieldErrors).length) {
      return res.status(422).json(validationError(fieldErrors));
    }

    if (slot.locked) {
      return res.status(403).json({
        errors: [
          {
            code: 'ACTION_NOT_ALLOWED',
            message: 'This slot is locked.',
            details: {},
            retryable: false
          }
        ],
        snapshot: {
          availability: availabilitySnapshot(slot.id)
        }
      });
    }

    if (slot.cutoff && now > slot.cutoff) {
      return res.status(403).json({
        errors: [
          {
            code: 'CUTOFF_PASSED',
            message: 'Signups are closed for this slot.',
            details: {},
            retryable: false
          }
        ],
        snapshot: {
          availability: availabilitySnapshot(slot.id)
        }
      });
    }

    if (slot.remaining < qty) {
      return res.status(409).json({
        errors: [
          {
            code: 'SLOT_FULL',
            message: 'That slot is no longer available.',
            details: {},
            retryable: false
          }
        ],
        snapshot: {
          availability: availabilitySnapshot(slot.id, {
            can_signup: false,
            reason: 'slot_full'
          })
        }
      });
    }

    slot.remaining -= qty;

    const signup = {
      id: uuidv4(),
      slot_id: slot.id,
      qty,
      identity_type: identityType,
      status: 'confirmed',
      can_edit: true,
      can_cancel: true,
      can_claim: identityType === 'guest'
    };

    state.signups.push(signup);

    return res.status(200).json({
      data: {
        signup,
        availability: availabilitySnapshot(slot.id)
      },
      errors: []
    });
  });

  app.use((req, res) => {
    res.status(404).json({
      errors: [
        {
          code: 'NOT_FOUND',
          message: 'Route not found.',
          details: {},
          retryable: false
        }
      ]
    });
  });

  return app;
};

resetState();

module.exports = {
  createApp,
  resetState,
  state
};
