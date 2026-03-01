const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const paymentProvider = require('../providers/mockStripeAdapter'); // Inject actual provider here
const logger = require('../utils/logger');

class BillingService {
    async getSubscriptionStatus(userId) {
        const subscription = await prisma.subscription.findFirst({
            where: { userId },
            include: { plan: true },
        });

        if (!subscription) {
            return { status: 'none' };
        }

        return {
            status: subscription.status,
            plan: subscription.plan.name,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        };
    }

    async createCheckoutSession(userId, planId, successUrl, cancelUrl) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new Error('User not found');

        const plan = await prisma.plan.findUnique({ where: { id: planId } });
        if (!plan) throw new Error('Plan not found');

        // Get or create provider customer
        let customerId;
        const existingSub = await prisma.subscription.findFirst({ where: { userId } });

        if (existingSub && existingSub.providerCustomerId) {
            customerId = existingSub.providerCustomerId;
        } else {
            customerId = await paymentProvider.createCustomer(user);
        }

        const session = await paymentProvider.createCheckoutSession({
            customerId,
            priceId: plan.providerPriceId,
            successUrl,
            cancelUrl,
        });

        return session;
    }

    async cancelSubscription(userId) {
        const subscription = await prisma.subscription.findFirst({
            where: { userId, status: 'ACTIVE' },
        });

        if (!subscription || !subscription.providerSubId) {
            throw new Error('No active subscription found');
        }

        const canceledSub = await paymentProvider.cancelSubscription(subscription.providerSubId);

        // Update local DB
        const updated = await prisma.subscription.update({
            where: { id: subscription.id },
            data: {
                status: canceledSub.status.toUpperCase(),
                cancelAtPeriodEnd: canceledSub.cancel_at_period_end || true,
            }
        });

        return updated;
    }

    async updateSubscription(userId, newPlanId) {
        const subscription = await prisma.subscription.findFirst({
            where: { userId, status: 'ACTIVE' },
        });

        if (!subscription || !subscription.providerSubId) {
            throw new Error('No active subscription found to upgrade/downgrade');
        }

        const newPlan = await prisma.plan.findUnique({ where: { id: newPlanId } });
        if (!newPlan) throw new Error('New plan not found');

        const updatedSub = await paymentProvider.updateSubscription(
            subscription.providerSubId,
            newPlan.providerPriceId
        );

        // Update local DB
        const updated = await prisma.subscription.update({
            where: { id: subscription.id },
            data: {
                planId: newPlan.id,
            }
        });

        return updated;
    }

    async handleWebhook(event) {
        // Idempotent webhook handling based on event type
        logger.info(`Handling webhook event: ${event.type}`);

        switch (event.type) {
            case 'checkout.session.completed':
                await this._handleCheckoutCompleted(event.data.object);
                break;
            case 'customer.subscription.updated':
                await this._handleSubscriptionUpdated(event.data.object);
                break;
            case 'customer.subscription.deleted':
                await this._handleSubscriptionDeleted(event.data.object);
                break;
            default:
                logger.info(`Unhandled event type ${event.type}`);
        }
    }

    async _handleCheckoutCompleted(session) {
        // Session contains customer ID and subscription ID
        const { customer: customerId, subscription: subId } = session;

        // We'd typically lookup the user by customerId, or client_reference_id on the session
        // For demonstration, assume we query subscription by providerCustomerId or we passed userId in metadata
        const userId = session.metadata?.userId;
        const planId = session.metadata?.planId;

        if (!userId || !planId) {
            logger.warn('Webhook session missing metadata userId or planId');
            return;
        }

        // Upsert subscription marking it as ACTIVE
        await prisma.subscription.upsert({
            where: { userId_planId: { userId, planId } },
            create: {
                userId,
                planId,
                providerSubId: subId,
                providerCustomerId: customerId,
                status: 'ACTIVE',
                currentPeriodStart: new Date(),
                // Mocking end period to +30 days
                currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
            update: {
                providerSubId: subId,
                status: 'ACTIVE',
                currentPeriodStart: new Date(),
            }
        });
    }

    async _handleSubscriptionUpdated(subscription) {
        const providerSubId = subscription.id;
        const status = subscription.status.toUpperCase();

        // Convert timestamp to Date depending on provider
        const currentPeriodStart = new Date(subscription.current_period_start * 1000);
        const currentPeriodEnd = new Date(subscription.current_period_end * 1000);

        await prisma.subscription.updateMany({
            where: { providerSubId },
            data: {
                status,
                currentPeriodStart,
                currentPeriodEnd,
                cancelAtPeriodEnd: subscription.cancel_at_period_end,
            }
        });
    }

    async _handleSubscriptionDeleted(subscription) {
        const providerSubId = subscription.id;
        await prisma.subscription.updateMany({
            where: { providerSubId },
            data: {
                status: 'CANCELED',
                cancelAtPeriodEnd: false,
            }
        });
    }
}

module.exports = new BillingService();
