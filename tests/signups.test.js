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

  it('is idempotent for duplicate signup attempts', async () => {
    await request(app).post('/signups').send({
      slot_id: 12,
      qty: 1,
      guest: { email: 'a@b.com', name: 'A B' }
    });

    const response = await request(app).post('/signups').send({
      slot_id: 12,
      qty: 1,
      guest: { email: 'a@b.com', name: 'A B' }
    });

    expect(response.status).toBe(200);
    expect(state.signups).toHaveLength(1);
    expect(response.body.data.availability.remaining).toBe(4);
    expect(response.body.data.signup).toMatchObject({
      slot_id: 12,
      identity_type: 'guest',
      qty: 1
    });
  });

  it('cancels signup and restores availability', async () => {
    const create = await request(app).post('/signups').send({
      slot_id: 12,
      qty: 1,
      guest: { email: 'cancel@example.com', name: 'Cancel' }
    });

    const response = await request(app)
      .post(`/signups/${create.body.data.signup.id}/cancel`)
      .send({
        guest: { email: 'cancel@example.com' }
      });

    expect(response.status).toBe(200);
    expect(response.body.data.signup.status).toBe('canceled');
    expect(response.body.data.signup.can_cancel).toBe(false);
    expect(response.body.data.availability.remaining).toBe(5);
    expect(state.slots.get(12).remaining).toBe(5);
  });

  it('rejects cancellation from non-owner', async () => {
    const create = await request(app).post('/signups').send({
      slot_id: 12,
      qty: 1,
      guest: { email: 'other@example.com', name: 'Other' }
    });

    const response = await request(app)
      .post(`/signups/${create.body.data.signup.id}/cancel`)
      .set('x-wp-user-id', '999')
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.errors[0].code).toBe('NOT_OWNER');
    expect(response.body.snapshot).toBeDefined();
  });

  it('returns 409 when signup already canceled', async () => {
    const create = await request(app).post('/signups').send({
      slot_id: 12,
      qty: 1,
      guest: { email: 'repeat@example.com', name: 'Repeat' }
    });

    await request(app)
      .post(`/signups/${create.body.data.signup.id}/cancel`)
      .send({ guest: { email: 'repeat@example.com' } });

    const response = await request(app)
      .post(`/signups/${create.body.data.signup.id}/cancel`)
      .send({ guest: { email: 'repeat@example.com' } });

    expect(response.status).toBe(409);
    expect(response.body.errors[0].code).toBe('SIGNUP_ALREADY_CANCELED');
  });

  it('returns 404 when signup is missing', async () => {
    const response = await request(app)
      .post('/signups/does-not-exist/cancel')
      .send({ guest: { email: 'missing@example.com' } });

    expect(response.status).toBe(404);
    expect(response.body.errors[0].code).toBe('SIGNUP_NOT_FOUND');
  });

});

describe('GET /events/:eventId', () => {
  let app;

  beforeEach(() => {
    resetState();
    app = createApp();
  });

  it('returns the event snapshot with canonical slot availability', async () => {
    const response = await request(app).get('/events/1');

    expect(response.status).toBe(200);
    expect(response.body.errors).toEqual([]);
    expect(response.body.data.event.id).toBe(1);
    expect(response.body.data.event.slots).toHaveLength(1);
    const slot = response.body.data.event.slots[0];
    expect(slot.id).toBe(12);
    expect(slot.availability.remaining).toBe(5);
    expect(response.body.data.my_signups).toEqual([]);
  });

  it('returns my signups when guest identity is provided', async () => {
    const guestEmail = 'reader@example.com';
    await request(app).post('/signups').send({
      slot_id: 12,
      qty: 1,
      guest: { email: guestEmail, name: 'Reader' }
    });

    const response = await request(app)
      .get('/events/1')
      .query({ guest_email: guestEmail });

    expect(response.status).toBe(200);
    expect(response.body.data.my_signups).toHaveLength(1);
    expect(response.body.data.my_signups[0].identity_key).toBe(`guest:${guestEmail}`);
    expect(response.body.data.event.slots[0].availability.remaining).toBe(4);
  });

  it('returns 404 when the event id is unknown', async () => {
    const response = await request(app).get('/events/999');

    expect(response.status).toBe(404);
    expect(response.body.errors[0].code).toBe('EVENT_NOT_FOUND');
  });
});
