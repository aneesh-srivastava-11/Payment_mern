const PaymentProvider = require('./paymentProvider');
const logger = require('../utils/logger');
const Razorpay = require('razorpay');
const crypto = require('crypto');

class RazorpayAdapter extends PaymentProvider {
    constructor() {
        super();
        const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder';
        const keySecret = process.env.RAZORPAY_KEY_SECRET || 'rzp_test_secret_placeholder';
        this.razorpay = new Razorpay({
            key_id: keyId,
            key_secret: keySecret
        });
        this.webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'whsec_rzp_placeholder';
    }

    async createCustomer(user) {
        logger.info(`[Razorpay] Creating customer for user ${user.id} (Email: ${user.email})`);
        try {
            const customer = await this.razorpay.customers.create({
                name: user.name || 'SaaS User',
                email: user.email,
                notes: {
                    userId: user.id,
                    tenantId: user.tenantId
                }
            });
            return customer.id;
        } catch (err) {
            logger.error(`[Razorpay] Error creating customer: ${err.message}`);
            throw err;
        }
    }

    async createCheckoutSession({ customerId, priceId, successUrl, cancelUrl, userId, planId, tenantId }) {
        logger.info(`[Razorpay] Creating subscription checkout session for customer ${customerId}, plan ${priceId}`);
        try {
            // In Razorpay, we first create a subscription entity
            const subscription = await this.razorpay.subscriptions.create({
                plan_id: priceId,
                total_count: 60, // Standard 5 years billing limit (monthly/yearly depends on plan definition)
                quantity: 1,
                customer_id: customerId,
                notes: {
                    userId,
                    planId,
                    tenantId
                }
            });

            // Return subscription id and short_url for standard Razorpay checkout flow
            return {
                sessionId: subscription.id,
                url: subscription.short_url || `https://checkout.razorpay.com/v1/checkout.html?subscription_id=${subscription.id}`
            };
        } catch (err) {
            logger.error(`[Razorpay] Error creating subscription: ${err.message}`);
            throw err;
        }
    }

    async cancelSubscription(subscriptionId) {
        logger.info(`[Razorpay] Canceling subscription ${subscriptionId}`);
        try {
            // Cancel immediately by setting cancel_at_cycle_end to false
            const subscription = await this.razorpay.subscriptions.cancel(subscriptionId, false);
            return {
                id: subscription.id,
                status: subscription.status, // e.g., 'cancelled'
                cancel_at_period_end: subscription.cancel_at_cycle_end || false
            };
        } catch (err) {
            logger.error(`[Razorpay] Error canceling subscription: ${err.message}`);
            throw err;
        }
    }

    async updateSubscription(subscriptionId, newPriceId) {
        logger.info(`[Razorpay] Updating subscription ${subscriptionId} to plan ${newPriceId}`);
        try {
            // Update subscription to new plan
            const subscription = await this.razorpay.subscriptions.update(subscriptionId, {
                plan_id: newPriceId
            });
            return {
                id: subscription.id,
                status: subscription.status,
                items: { data: [{ price: { id: newPriceId } }] }
            };
        } catch (err) {
            logger.error(`[Razorpay] Error updating subscription: ${err.message}`);
            throw err;
        }
    }

    async getSubscription(subscriptionId) {
        logger.info(`[Razorpay] Retrieving subscription ${subscriptionId}`);
        try {
            const subscription = await this.razorpay.subscriptions.fetch(subscriptionId);
            return {
                id: subscription.id,
                status: subscription.status,
                current_period_start: subscription.current_start,
                current_period_end: subscription.current_end,
                cancel_at_period_end: subscription.cancel_at_cycle_end || false,
                trial_start: subscription.start_at,
                trial_end: subscription.charge_at // Razorpay trial period field
            };
        } catch (err) {
            logger.error(`[Razorpay] Error retrieving subscription: ${err.message}`);
            throw err;
        }
    }

    verifyWebhook(payload, signature) {
        logger.info('[Razorpay] Verifying webhook signature');
        try {
            if (!signature) {
                throw new Error('No signature provided in webhook header');
            }
            const expectedSignature = crypto
                .createHmac('sha256', this.webhookSecret)
                .update(payload.toString())
                .digest('hex');

            if (expectedSignature !== signature) {
                throw new Error('Webhook signature mismatch');
            }
            // Parse event body
            return JSON.parse(payload.toString());
        } catch (err) {
            logger.error(`[Razorpay] Webhook verification failed: ${err.message}`);
            throw new Error(`Webhook Error: ${err.message}`);
        }
    }
}

module.exports = new RazorpayAdapter();
