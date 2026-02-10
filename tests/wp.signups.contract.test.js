const request = require('supertest');

const WP_BASE = process.env.WP_BASE_URL || 'https://hopeisreal.local';
const SIGNUPS = '/wp-json/event-planning/v1/signups';
const DEV_SECRET = process.env.EP_DEV_SECRET;

// Optional: for Local's self-signed cert (dev only)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

describe('WP POST /event-planning/v1/signups (contract)', () => {
    beforeEach(async () => {
        if (!DEV_SECRET) throw new Error('EP_DEV_SECRET is required for dev endpoints');

        await request(WP_BASE)
            .post('/wp-json/event-planning/v1/dev/reset')
            .set('x-ep-dev-secret', DEV_SECRET)
            .send({});
    });

    it('returns 200 with canonical availability and signup data', async () => {
        const response = await request(WP_BASE)
            .post(SIGNUPS)
            .send({
                slot_id: 12,
                qty: 1,
                guest: { email: 'user@example.com', name: 'Jane Doe' }
            });

        expect(response.status).toBe(200);
        expect(response.body.errors).toEqual([]);
        expect(response.body.data.signup.identity_type).toBe('guest');
        expect(response.body.data.availability.slot_id).toBe(12);
        expect(response.body.data.availability.remaining).toBe(4);
        expect(response.body.data.availability.can_signup).toBe(true);
        expect(response.body.data.availability.reason).toBeNull();
    });

    it('returns 422 when required guest fields are missing', async () => {
        const response = await request(WP_BASE)
            .post(SIGNUPS)
            .send({ slot_id: 12, qty: 1 });

        expect(response.status).toBe(422);
        expect(response.body.errors[0].code).toBe('VALIDATION_FAILED');
        expect(response.body.errors[0].details.field_errors).toMatchObject({
            email: expect.any(String),
            name: expect.any(String)
        });
    });

    it('is idempotent for duplicate signup attempts', async () => {
        await request(WP_BASE).post(SIGNUPS).send({
            slot_id: 12, qty: 1, guest: { email: 'a@b.com', name: 'A B' }
        });

        const response = await request(WP_BASE).post(SIGNUPS).send({
            slot_id: 12, qty: 1, guest: { email: 'a@b.com', name: 'A B' }
        });

        expect(response.status).toBe(200);
        expect(response.body.errors).toEqual([]);
        expect(response.body.data.signup).toMatchObject({
            slot_id: 12,
            identity_type: 'guest',
            qty: 1
        });
    });

    it('returns 409 with snapshot when slot does not have enough remaining space', async () => {
        await request(WP_BASE)
            .post('/wp-json/event-planning/v1/dev/slots/12')
            .set('x-ep-dev-secret', DEV_SECRET)
            .send({ remaining: 1 });

        const response = await request(WP_BASE)
            .post(SIGNUPS)
            .send({
                slot_id: 12,
                qty: 2,
                guest: { email: 'user@example.com', name: 'Jane Doe' }
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

    it('returns 403 with snapshot when cutoff has passed', async () => {
        const pastCutoff = Math.floor(Date.now() / 1000) - 60;

        await request(WP_BASE)
            .post('/wp-json/event-planning/v1/dev/slots/12')
            .set('x-ep-dev-secret', DEV_SECRET)
            .send({ cutoff: pastCutoff });

        const response = await request(WP_BASE)
            .post(SIGNUPS)
            .send({
                slot_id: 12,
                qty: 1,
                guest: { email: 'user@example.com', name: 'Jane Doe' }
            });

        expect(response.status).toBe(403);
        expect(response.body.errors[0].code).toBe('CUTOFF_PASSED');
        expect(response.body.snapshot).toHaveProperty('availability.reason', 'cutoff_passed');
    });

    it('cancels a signup and returns the updated snapshot', async () => {
        const signup = await request(WP_BASE).post(SIGNUPS).send({
            slot_id: 12,
            qty: 1,
            guest: { email: 'cancel@example.com', name: 'Cancel' }
        });

        const response = await request(WP_BASE)
            .post(`${SIGNUPS}/${signup.body.data.signup.id}/cancel`)
            .send({ guest: { email: 'cancel@example.com' } });

        expect(response.status).toBe(200);
        expect(response.body.errors).toEqual([]);
        expect(response.body.data.signup.status).toBe('canceled');
        expect(response.body.data.availability.remaining).toBe(5);
    });

    it('rejects cancellation when the requester is not the signup owner', async () => {
        const signup = await request(WP_BASE).post(SIGNUPS).send({
            slot_id: 12,
            qty: 1,
            guest: { email: 'owner@example.com', name: 'Owner' }
        });

        const response = await request(WP_BASE)
            .post(`${SIGNUPS}/${signup.body.data.signup.id}/cancel`)
            .send({ guest: { email: 'other@example.com' } });

        expect(response.status).toBe(403);
        expect(response.body.errors[0].code).toBe('NOT_OWNER');
    });

    it('returns 409 when cancelling an already canceled signup', async () => {
        const signup = await request(WP_BASE).post(SIGNUPS).send({
            slot_id: 12,
            qty: 1,
            guest: { email: 'repeat@example.com', name: 'Repeat' }
        });

        await request(WP_BASE)
            .post(`${SIGNUPS}/${signup.body.data.signup.id}/cancel`)
            .send({ guest: { email: 'repeat@example.com' } });

        const response = await request(WP_BASE)
            .post(`${SIGNUPS}/${signup.body.data.signup.id}/cancel`)
            .send({ guest: { email: 'repeat@example.com' } });

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('SIGNUP_ALREADY_CANCELED');
    });

    it('returns 404 when the signup cannot be found', async () => {
        const response = await request(WP_BASE)
            .post(`${SIGNUPS}/missing-id/cancel`)
            .send({ guest: { email: 'missing@example.com' } });

        expect(response.status).toBe(404);
        expect(response.body.errors[0].code).toBe('SIGNUP_NOT_FOUND');
    });
});

describe('GET /event-planning/v1/events/:eventId (contract)', () => {
    beforeEach(async () => {
        if (!DEV_SECRET) throw new Error('EP_DEV_SECRET is required for dev endpoints');

        await request(WP_BASE)
            .post('/wp-json/event-planning/v1/dev/reset')
            .set('x-ep-dev-secret', DEV_SECRET)
            .send({});
    });

    it('returns the event snapshot with canonical slot availability', async () => {
        const response = await request(WP_BASE)
            .get('/wp-json/event-planning/v1/events/1');

        expect(response.status).toBe(200);
        expect(response.body.errors).toEqual([]);
        expect(response.body.data.event.id).toBe(1);
        expect(response.body.data.event.slots[0].id).toBe(12);
        expect(response.body.data.event.slots[0].availability.remaining).toBe(5);
        expect(response.body.data.my_signups).toEqual([]);
    });

    it('includes my signups for the guest identity in the query', async () => {
        await request(WP_BASE).post(SIGNUPS).send({
            slot_id: 12,
            qty: 1,
            guest: { email: 'reader@example.com', name: 'Reader' }
        });

        const response = await request(WP_BASE)
            .get('/wp-json/event-planning/v1/events/1')
            .query({ guest_email: 'reader@example.com' });

        expect(response.status).toBe(200);
        expect(response.body.data.event.slots[0].availability.remaining).toBe(4);
        expect(response.body.data.my_signups).toHaveLength(1);
        expect(response.body.data.my_signups[0].identity_key).toContain('guest:reader@example.com');
    });

    it('returns 404 when the event id is invalid', async () => {
        const response = await request(WP_BASE).get('/wp-json/event-planning/v1/events/999');

        expect(response.status).toBe(404);
        expect(response.body.errors[0].code).toBe('EVENT_NOT_FOUND');
    });
});
