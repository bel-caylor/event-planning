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
});
