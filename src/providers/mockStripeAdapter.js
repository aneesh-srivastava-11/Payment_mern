const PaymentProvider = require('./paymentProvider');
const logger = require('../utils/logger');
const crypto = require('crypto');

/**
 * A mock adapter that simulates Stripe-like behavior, 
 * fulfilling the PaymentProvider abstraction.
 */
class MockStripeAdapter extends PaymentProvider {
    constructor() {
        super();
        this.secretKey = process.env.MOCK_STRIPE_SECRET_KEY || 'sk_test_mock';
        this.webhookSecret = process.env.MOCK_STRIPE_WEBHOOK_SECRET || 'whsec_mock';
    }

    async createCustomer(user) {
        logger.info(`[MockStripe] Creating customer for user ${user.id}`);
        return `cus_mock_${crypto.randomBytes(8).toString('hex')}`;
    }

    async createCheckoutSession({ customerId, priceId, successUrl, cancelUrl }) {
        logger.info(`[MockStripe] Creating checkout session for customer ${customerId}, price ${priceId}`);
        const sessionId = `cs_test_${crypto.randomBytes(8).toString('hex')}`;
        return {
            sessionId,
            url: `https://mock-provider.com/checkout/${sessionId}`,
        };
    }

    async cancelSubscription(subscriptionId) {
        logger.info(`[MockStripe] Canceling subscription ${subscriptionId}`);
        return {
            id: subscriptionId,
            status: 'canceled',
            cancel_at_period_end: false,
        };
    }

    async updateSubscription(subscriptionId, newPriceId) {
        logger.info(`[MockStripe] Updating subscription ${subscriptionId} to price ${newPriceId}`);
        return {
            id: subscriptionId,
            status: 'active',
            items: { data: [{ price: { id: newPriceId } }] },
        };
    }

    verifyWebhook(payload, signature) {
        // In a real implementation (e.g. Stripe), this verifies the signature against the secret
        // For the mock, we just parse the JSON and trust it for development.
        logger.info('[MockStripe] Verifying webhook payload');
        try {
            if (!signature) {
                throw new Error('No signature provided in webhook header');
            }
            const event = JSON.parse(payload.toString());
            return event;
        } catch (err) {
            throw new Error(`Webhook Error: ${err.message}`);
        }
    }
}

module.exports = new MockStripeAdapter();
