const request = require('supertest');
const { createApp, resetState, state } = require('../src/app');

describe('POST /signups', () => {
  let app;

  beforeEach(() => {
    resetState();
    app = createApp();
  });

  it('returns 200 with canonical availability and signup data', async () => {
    const response = await request(app)
      .post('/signups')
      .send({
        slot_id: 12,
        qty: 1,
        guest: {
          email: 'user@example.com',
          name: 'Jane Doe'
        }
      });

    expect(response.status).toBe(200);
    expect(response.body.errors).toEqual([]);
    expect(response.body.data.signup.identity_type).toBe('guest');
    expect(response.body.data.availability.slot_id).toBe(12);
    expect(response.body.data.availability.remaining).toBe(4);
    expect(response.body.data.availability.can_signup).toBe(true);
    expect(response.body.data.availability.reason).toBeNull();
    expect(state.signups).toHaveLength(1);
  });

  it('returns 409 with snapshot when slot does not have enough remaining space', async () => {
    const slot = state.slots.get(12);
    slot.remaining = 1;

    const response = await request(app)
      .post('/signups')
      .send({
        slot_id: 12,
        qty: 2,
        guest: {
          email: 'user@example.com',
          name: 'Jane Doe'
        }
      });

    expect(response.status).toBe(409);
    expect(response.body.errors[0].code).toBe('SLOT_FULL');
    expect(response.body.snapshot).toEqual({
      availability: expect.objectContaining({
        slot_id: 12,
        remaining: 1,
        can_signup: false,
        reason: 'slot_full'
      })
    });
  });

  it('returns 422 when required guest fields are missing', async () => {
    const response = await request(app)
      .post('/signups')
      .send({
        slot_id: 12,
        qty: 1
      });

    expect(response.status).toBe(422);
    expect(response.body.errors[0].code).toBe('VALIDATION_FAILED');
    expect(response.body.errors[0].details.field_errors).toMatchObject({
      email: expect.stringContaining('required'),
      name: expect.stringContaining('required')
    });
  });

  it('returns 403 with snapshot when cutoff has passed', async () => {
    const slot = state.slots.get(12);
    slot.cutoff = new Date(Date.now() - 1000);

    const response = await request(app)
      .post('/signups')
      .send({
        slot_id: 12,
        qty: 1,
        guest: {
          email: 'user@example.com',
          name: 'Jane Doe'
        }
      });

    expect(response.status).toBe(403);
    expect(response.body.errors[0].code).toBe('CUTOFF_PASSED');
    expect(response.body.snapshot).toHaveProperty('availability.reason', 'cutoff_passed');
  });
});
