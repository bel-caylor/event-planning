const request = require('supertest');

const WP_BASE = process.env.WP_BASE_URL || 'https://hopeisreal.local';
const EVENTS = '/wp-json/event-planning/v1/events/1';
const DEV_SECRET = process.env.EP_DEV_SECRET;

// Optional: for Local's self-signed cert (dev only)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

describe('WP GET /event-planning/v1/events/1 (snapshot contract)', () => {
    beforeEach(async () => {
        if (!DEV_SECRET) throw new Error('EP_DEV_SECRET is required for dev endpoints');

        await request(WP_BASE)
            .post('/wp-json/event-planning/v1/dev/reset')
            .set('x-ep-dev-secret', DEV_SECRET)
            .send({});
    });

    it('returns the canonical event snapshot', async () => {
        const response = await request(WP_BASE)
            .get(EVENTS)
            .set('x-ep-dev-secret', DEV_SECRET);

        expect(response.status).toBe(200);
        expect(response.body.errors).toEqual([]);
        expect(response.body.data.event.id).toBe(1);
        expect(Array.isArray(response.body.data.event.slots)).toBe(true);

        const slot = response.body.data.event.slots.find((s) => s.slot_id === 12);
        expect(slot).toBeDefined();
        expect(slot.remaining).toBeGreaterThanOrEqual(0);
        expect(slot.can_signup).toBeDefined();
        expect(slot.reason).toBeDefined();

        expect(Array.isArray(response.body.data.my_signups)).toBe(true);
        expect(response.body.data.my_signups).toEqual([]);
    });
});
