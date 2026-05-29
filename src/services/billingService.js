const tenantRepository = require('../repositories/tenantRepository');
const userRepository = require('../repositories/userRepository');
const planRepository = require('../repositories/planRepository');
const customerRepository = require('../repositories/customerRepository');
const subscriptionRepository = require('../repositories/subscriptionRepository');
const billingEventRepository = require('../repositories/billingEventRepository');
const invoiceRepository = require('../repositories/invoiceRepository');
const usageRecordRepository = require('../repositories/usageRecordRepository');
const subscriptionStateService = require('./subscriptionStateService');
const paymentProviderFactory = require('../providers/paymentProviderFactory');
const logger = require('../utils/logger');

class BillingService {
    // 1. Subscription Lifecycle methods
    async getSubscriptionStatus(userId) {
        const subscription = await subscriptionRepository.findFirstByUserId(userId);
        if (!subscription) {
            return { status: 'none' };
        }

        return {
            id: subscription.id,
            status: subscription.status,
            plan: subscription.plan.name,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            trialEndsAt: subscription.trialEndsAt,
            dunningRetryCount: subscription.dunningRetryCount
        };
    }

    async createCheckoutSession(userId, planId, successUrl, cancelUrl, providerName = 'mock') {
        const user = await userRepository.findById(userId);
        if (!user) throw new Error('User not found');

        const plan = await planRepository.findById(planId);
        if (!plan) throw new Error('Plan not found');

        const provider = paymentProviderFactory.getProvider(providerName);

        // Get or create customer mapping
        let customerId;
        const existingCustomer = await customerRepository.findByUserIdAndProvider(userId, providerName);

        if (existingCustomer) {
            customerId = existingCustomer.providerCustomerId;
        } else {
            customerId = await provider.createCustomer(user);
            await customerRepository.create({
                userId,
                tenantId: user.tenantId,
                provider: providerName,
                providerCustomerId: customerId
            });
        }

        const session = await provider.createCheckoutSession({
            customerId,
            priceId: plan.providerPriceId || 'price_mock_default',
            successUrl,
            cancelUrl,
            userId,
            planId,
            tenantId: user.tenantId
        });

        // Log checkout session creation event
        logger.info({ userId, planId, providerName, sessionId: session.sessionId }, 'Checkout session created');
        return session;
    }

    async cancelSubscription(userId, providerName = 'mock') {
        const subscription = await subscriptionRepository.findActiveByUserId(userId);
        if (!subscription || !subscription.providerSubId) {
            throw new Error('No active subscription found');
        }

        const provider = paymentProviderFactory.getProvider(providerName);
        const canceledSub = await provider.cancelSubscription(subscription.providerSubId);

        const currentStatus = subscription.status;
        const nextStatus = 'CANCELED';
        const validatedStatus = subscriptionStateService.validateAndTransition(subscription.id, currentStatus, nextStatus);

        const updated = await subscriptionRepository.update(subscription.id, {
            status: validatedStatus,
            cancelAtPeriodEnd: canceledSub.cancel_at_period_end || false
        });

        logger.info({ subscriptionId: subscription.id, userId, status: validatedStatus }, 'Subscription canceled');
        return updated;
    }

    async updateSubscription(userId, newPlanId, providerName = 'mock') {
        const subscription = await subscriptionRepository.findActiveByUserId(userId);
        if (!subscription || !subscription.providerSubId) {
            throw new Error('No active subscription found to upgrade/downgrade');
        }

        const newPlan = await planRepository.findById(newPlanId);
        if (!newPlan) throw new Error('New plan not found');

        const provider = paymentProviderFactory.getProvider(providerName);
        await provider.updateSubscription(
            subscription.providerSubId,
            newPlan.providerPriceId || 'price_mock_default'
        );

        const updated = await subscriptionRepository.update(subscription.id, {
            planId: newPlan.id
        });

        logger.info({ subscriptionId: subscription.id, userId, newPlanId }, 'Subscription updated');
        return updated;
    }

    // 2. Webhook Handling with Idempotency & Replay Protection
    async handleWebhook(event, providerName = 'mock') {
        const providerEventId = event.id || event.event_id || `evt_mock_${Date.now()}`;
        
        // Webhook replay safety check
        const existingEvent = await billingEventRepository.findByProviderEventId(providerEventId);
        if (existingEvent && existingEvent.processed) {
            logger.warn({ providerEventId }, 'Webhook event already processed. Skipping.');
            return;
        }

        // Get tenantId from payload if available
        let tenantId = 'system';
        let subscriptionId = null;

        const eventType = event.type || event.event || 'unknown';

        // Extract metadata depending on event type
        const payloadObject = event.data?.object || event.payload || event;
        
        // Attempt to find tenant/subscription details
        const metadata = payloadObject.metadata || payloadObject.notes || {};
        if (metadata.tenantId) {
            tenantId = metadata.tenantId;
        }
        
        // Log auditing event
        const billingEvent = await billingEventRepository.create({
            tenantId,
            subscriptionId,
            provider: providerName,
            eventType,
            payload: event,
            processed: false,
            providerEventId
        });

        try {
            logger.info({ eventType, providerEventId }, `Processing billing event: ${eventType}`);

            switch (eventType) {
                case 'checkout.session.completed':
                case 'subscription.activated':
                    await this._handleCheckoutCompleted(payloadObject, billingEvent.id, providerName);
                    break;
                case 'customer.subscription.updated':
                case 'subscription.updated':
                    await this._handleSubscriptionUpdated(payloadObject, billingEvent.id, providerName);
                    break;
                case 'customer.subscription.deleted':
                case 'subscription.cancelled':
                    await this._handleSubscriptionDeleted(payloadObject, billingEvent.id);
                    break;
                case 'invoice.created':
                case 'invoice.upcoming':
                    await this._handleInvoiceCreated(payloadObject);
                    break;
                case 'invoice.payment_succeeded':
                case 'payment.succeeded':
                    await this._handleInvoicePaid(payloadObject);
                    break;
                case 'invoice.payment_failed':
                case 'payment.failed':
                    await this._handleInvoiceFailed(payloadObject);
                    break;
                default:
                    logger.info(`Unhandled event type: ${eventType}`);
            }

            // Mark event as processed
            await billingEventRepository.markProcessed(billingEvent.id);
        } catch (err) {
            logger.error(err, `Error processing webhook event: ${providerEventId}`);
            throw err;
        }
    }

    async _handleCheckoutCompleted(session, eventId, providerName) {
        const metadata = session.metadata || session.notes || {};
        const userId = metadata.userId;
        const planId = metadata.planId;
        const tenantId = metadata.tenantId || 'system';

        if (!userId || !planId) {
            logger.warn('Checkout completed payload missing userId or planId');
            return;
        }

        const subId = session.subscription || session.id;
        const customerId = session.customer || session.customer_id;

        // Check if plan has trial setup
        const plan = await planRepository.findById(planId);
        const trialDays = plan?.trialDays || 0;
        
        // Prevent trial abuse: check if user has had trial previously
        const hasUsedTrial = await this._checkTrialAbuse(userId);
        const trialEndsAt = (!hasUsedTrial && trialDays > 0) 
            ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000) 
            : null;

        const initialStatus = trialEndsAt ? 'TRIALING' : 'ACTIVE';

        const subscription = await subscriptionRepository.upsert(
            userId,
            planId,
            {
                providerSubId: subId,
                providerCustomerId: customerId,
                status: initialStatus,
                currentPeriodStart: new Date(),
                currentPeriodEnd: trialEndsAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                trialEndsAt
            },
            {
                providerSubId: subId,
                status: initialStatus,
                currentPeriodStart: new Date(),
                currentPeriodEnd: trialEndsAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                trialEndsAt
            }
        );

        // Update billing event audit
        await billingEventRepository.create({
            tenantId,
            subscriptionId: subscription.id,
            provider: providerName,
            eventType: trialEndsAt ? 'trial.started' : 'subscription.activated',
            payload: { subscriptionId: subscription.id, trialEndsAt },
            processed: true
        });

        // Create initial invoice
        await invoiceRepository.create({
            subscriptionId: subscription.id,
            tenantId,
            amount: plan ? plan.price : 0,
            currency: plan ? plan.currency : 'usd',
            status: trialEndsAt ? 'pending' : 'paid',
            issuedAt: new Date(),
            paidAt: trialEndsAt ? null : new Date()
        });
    }

    async _handleSubscriptionUpdated(subPayload, eventId, providerName) {
        const providerSubId = subPayload.id;
        const providerStatus = (subPayload.status || 'active').toUpperCase();

        const subscription = await subscriptionRepository.findByProviderSubId(providerSubId);
        if (!subscription) {
            logger.warn(`Subscription update failed: local subscription for providerSubId ${providerSubId} not found`);
            return;
        }

        // Determine target status
        let targetStatus = 'ACTIVE';
        if (providerStatus === 'TRIALING') targetStatus = 'TRIALING';
        if (providerStatus === 'PAST_DUE') targetStatus = 'PAST_DUE';
        if (providerStatus === 'UNPAID') targetStatus = 'UNPAID';
        if (providerStatus === 'PAUSED') targetStatus = 'PAUSED';
        if (providerStatus === 'CANCELED' || providerStatus === 'CANCELLED') targetStatus = 'CANCELED';

        const validatedStatus = subscriptionStateService.validateAndTransition(
            subscription.id,
            subscription.status,
            targetStatus
        );

        // Convert period timestamps
        const currentPeriodStart = subPayload.current_period_start 
            ? new Date(subPayload.current_period_start * 1000) 
            : new Date();
        const currentPeriodEnd = subPayload.current_period_end 
            ? new Date(subPayload.current_period_end * 1000) 
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        await subscriptionRepository.update(subscription.id, {
            status: validatedStatus,
            currentPeriodStart,
            currentPeriodEnd,
            cancelAtPeriodEnd: subPayload.cancel_at_period_end || false
        });
    }

    async _handleSubscriptionDeleted(subPayload, eventId) {
        const providerSubId = subPayload.id;
        const subscription = await subscriptionRepository.findByProviderSubId(providerSubId);
        if (!subscription) return;

        const validatedStatus = subscriptionStateService.validateAndTransition(
            subscription.id,
            subscription.status,
            'CANCELED'
        );

        await subscriptionRepository.update(subscription.id, {
            status: validatedStatus,
            cancelAtPeriodEnd: false
        });
    }

    async _handleInvoiceCreated(invoicePayload) {
        const providerSubId = invoicePayload.subscription;
        if (!providerSubId) return;

        const subscription = await subscriptionRepository.findByProviderSubId(providerSubId);
        if (!subscription) return;

        const providerInvoiceId = invoicePayload.id;
        const existingInvoice = await invoiceRepository.findByProviderInvoiceId(providerInvoiceId);
        if (existingInvoice) return;

        await invoiceRepository.create({
            subscriptionId: subscription.id,
            tenantId: subscription.user.tenantId,
            providerInvoiceId,
            amount: invoicePayload.amount_due || invoicePayload.total || 0,
            currency: invoicePayload.currency || 'usd',
            status: 'pending',
            issuedAt: new Date(invoicePayload.created * 1000)
        });
    }

    async _handleInvoicePaid(invoicePayload) {
        const providerInvoiceId = invoicePayload.id;
        const providerSubId = invoicePayload.subscription;
        
        let subscription = null;
        if (providerSubId) {
            subscription = await subscriptionRepository.findByProviderSubId(providerSubId);
        }

        const data = {
            status: 'paid',
            paidAt: new Date()
        };

        if (providerInvoiceId) {
            const invoice = await invoiceRepository.findByProviderInvoiceId(providerInvoiceId);
            if (invoice) {
                await invoiceRepository.update(invoice.id, data);
            } else if (subscription) {
                await invoiceRepository.create({
                    subscriptionId: subscription.id,
                    tenantId: subscription.user.tenantId,
                    providerInvoiceId,
                    amount: invoicePayload.amount_paid || invoicePayload.total || 0,
                    currency: invoicePayload.currency || 'usd',
                    status: 'paid',
                    issuedAt: new Date(),
                    paidAt: new Date()
                });
            }
        }

        // Reset dunning attempts on successful payment
        if (subscription) {
            await subscriptionRepository.update(subscription.id, {
                dunningRetryCount: 0,
                dunningLastAttempt: null,
                status: 'ACTIVE'
            });
        }
    }

    async _handleInvoiceFailed(invoicePayload) {
        const providerInvoiceId = invoicePayload.id;
        const providerSubId = invoicePayload.subscription;

        if (!providerSubId) return;
        const subscription = await subscriptionRepository.findByProviderSubId(providerSubId);
        if (!subscription) return;

        // Dunning + Payment Failure Logic
        const dunningRetryLimit = parseInt(process.env.DUNNING_RETRY_LIMIT || '3', 10);
        const nextRetryCount = subscription.dunningRetryCount + 1;

        let targetStatus = 'PAST_DUE';
        if (nextRetryCount >= dunningRetryLimit) {
            targetStatus = 'CANCELED';
            logger.warn({ subscriptionId: subscription.id }, `Dunning retry limit reached. Canceling subscription.`);
        }

        const validatedStatus = subscriptionStateService.validateAndTransition(
            subscription.id,
            subscription.status,
            targetStatus
        );

        await subscriptionRepository.update(subscription.id, {
            status: validatedStatus,
            dunningRetryCount: nextRetryCount,
            dunningLastAttempt: new Date()
        });

        // Update local Invoice
        if (providerInvoiceId) {
            const invoice = await invoiceRepository.findByProviderInvoiceId(providerInvoiceId);
            if (invoice) {
                await invoiceRepository.update(invoice.id, {
                    status: 'failed'
                });
            }
        }
    }

    async _checkTrialAbuse(userId) {
        // Query to check if this user has previously trialed
        const sub = await subscriptionRepository.findFirstByUserId(userId);
        if (sub && sub.trialEndsAt) {
            return true;
        }
        return false;
    }

    // 3. Usage-Based metered billing
    async recordUsage(tenantId, action, usage) {
        const record = await usageRecordRepository.create({
            tenantId,
            action,
            usage
        });
        logger.info({ tenantId, action, usage }, 'Recorded usage event');
        return record;
    }

    async getUsage(tenantId, { page = 1, limit = 10 } = {}) {
        return usageRecordRepository.findByTenantId(tenantId, { page, limit });
    }

    // 4. Invoices Retrieval
    async getInvoices(tenantId, { page = 1, limit = 10 } = {}) {
        return invoiceRepository.listByTenant(tenantId, { page, limit });
    }

    async getInvoiceById(invoiceId) {
        const invoice = await invoiceRepository.findById(invoiceId);
        if (!invoice) throw new Error('Invoice not found');
        return invoice;
    }

    // 5. Admin Billing Operations
    async getAdminSubscriptions({ page = 1, limit = 10 } = {}) {
        return subscriptionRepository.list({ page, limit });
    }

    async getAdminEvents({ page = 1, limit = 10 } = {}) {
        return billingEventRepository.list({ page, limit });
    }

    async getAdminInvoices({ page = 1, limit = 10 } = {}) {
        return invoiceRepository.list({ page, limit });
    }

    async getAdminTenantBilling(tenantId, { page = 1, limit = 10 } = {}) {
        const [invoices, usage] = await Promise.all([
            invoiceRepository.list({ page, limit, tenantId }),
            usageRecordRepository.findByTenantId(tenantId, { page, limit })
        ]);
        return { invoices, usage };
    }
}

module.exports = new BillingService();
