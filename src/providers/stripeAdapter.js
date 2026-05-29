const PaymentProvider = require('./paymentProvider');
const logger = require('../utils/logger');
const Stripe = require('stripe');

class StripeAdapter extends PaymentProvider {
    constructor() {
        super();
        const apiKey = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder';
        this.stripe = new Stripe(apiKey, {
            apiVersion: '2023-10-16' // Or compatible version
        });
        this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_placeholder';
    }

    async createCustomer(user) {
        logger.info(`[Stripe] Creating customer for user ${user.id} (Email: ${user.email})`);
        try {
            const customer = await this.stripe.customers.create({
                email: user.email,
                name: user.name || undefined,
                metadata: {
                    userId: user.id,
                    tenantId: user.tenantId
                }
            });
            return customer.id;
        } catch (err) {
            logger.error(`[Stripe] Error creating customer: ${err.message}`);
            throw err;
        }
    }

    async createCheckoutSession({ customerId, priceId, successUrl, cancelUrl, userId, planId, tenantId }) {
        logger.info(`[Stripe] Creating checkout session for customer ${customerId}, price ${priceId}`);
        try {
            const session = await this.stripe.checkout.sessions.create({
                customer: customerId,
                payment_method_types: ['card'],
                line_items: [
                    {
                        price: priceId,
                        quantity: 1,
                    },
                ],
                mode: 'subscription',
                success_url: successUrl,
                cancel_url: cancelUrl,
                metadata: {
                    userId,
                    planId,
                    tenantId
                },
                subscription_data: {
                    metadata: {
                        userId,
                        planId,
                        tenantId
                    }
                }
            });
            return {
                sessionId: session.id,
                url: session.url
            };
        } catch (err) {
            logger.error(`[Stripe] Error creating checkout session: ${err.message}`);
            throw err;
        }
    }

    async cancelSubscription(subscriptionId) {
        logger.info(`[Stripe] Canceling subscription ${subscriptionId}`);
        try {
            const subscription = await this.stripe.subscriptions.cancel(subscriptionId);
            return {
                id: subscription.id,
                status: subscription.status,
                cancel_at_period_end: subscription.cancel_at_period_end
            };
        } catch (err) {
            logger.error(`[Stripe] Error canceling subscription: ${err.message}`);
            throw err;
        }
    }

    async updateSubscription(subscriptionId, newPriceId) {
        logger.info(`[Stripe] Updating subscription ${subscriptionId} to new price ${newPriceId}`);
        try {
            const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
            const itemId = subscription.items.data[0].id;
            const updated = await this.stripe.subscriptions.update(subscriptionId, {
                items: [
                    {
                        id: itemId,
                        price: newPriceId,
                    },
                ],
            });
            return {
                id: updated.id,
                status: updated.status,
                items: { data: [{ price: { id: newPriceId } }] }
            };
        } catch (err) {
            logger.error(`[Stripe] Error updating subscription: ${err.message}`);
            throw err;
        }
    }

    async getSubscription(subscriptionId) {
        logger.info(`[Stripe] Retrieving subscription ${subscriptionId}`);
        try {
            const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
            return {
                id: subscription.id,
                status: subscription.status,
                current_period_start: subscription.current_period_start,
                current_period_end: subscription.current_period_end,
                cancel_at_period_end: subscription.cancel_at_period_end,
                trial_start: subscription.trial_start,
                trial_end: subscription.trial_end
            };
        } catch (err) {
            logger.error(`[Stripe] Error retrieving subscription: ${err.message}`);
            throw err;
        }
    }

    verifyWebhook(payload, signature) {
        logger.info('[Stripe] Verifying webhook signature');
        try {
            return this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
        } catch (err) {
            logger.error(`[Stripe] Webhook verification failed: ${err.message}`);
            throw new Error(`Webhook Error: ${err.message}`);
        }
    }
}

module.exports = new StripeAdapter();
