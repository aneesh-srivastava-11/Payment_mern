/**
 * Abstract Payment Provider Interface
 * Any concrete provider (e.g. Stripe, Razorpay, Mock) should implement these methods.
 */
class PaymentProvider {
    /**
     * Create a customer representation in the payment provider.
     * @param {Object} user - The local user object
     * @returns {Promise<string>} The provider's customer ID
     */
    async createCustomer(user) { throw new Error('Not implemented'); }

    /**
     * Create a checkout session (URL) for the user to complete payment.
     * @param {Object} params - { customerId, priceId, successUrl, cancelUrl, userId, planId, tenantId }
     * @returns {Promise<Object>} { sessionId, url }
     */
    async createCheckoutSession(params) { throw new Error('Not implemented'); }

    /**
     * Cancel an active subscription.
     * @param {string} subscriptionId - The provider's subscription ID
     * @returns {Promise<Object>} Updated subscription data from provider
     */
    async cancelSubscription(subscriptionId) { throw new Error('Not implemented'); }

    /**
     * Upgrade or downgrade a subscription plan.
     * @param {string} subscriptionId - The provider's subscription ID
     * @param {string} newPriceId - The provider's new price ID
     * @returns {Promise<Object>} Updated subscription data from provider
     */
    async updateSubscription(subscriptionId, newPriceId) { throw new Error('Not implemented'); }

    /**
     * Verify and parse a webhook payload.
     * @param {Buffer} payload - The raw request body
     * @param {string} signature - The webhook signature from headers
     * @returns {Object} The parsed and verified event object
     */
    verifyWebhook(payload, signature) { throw new Error('Not implemented'); }

    /**
     * Retrieve subscription details from the provider.
     * @param {string} subscriptionId - The provider's subscription ID
     * @returns {Promise<Object>} Subscription details from provider
     */
    async getSubscription(subscriptionId) { throw new Error('Not implemented'); }
}

module.exports = PaymentProvider;
