const prisma = require('../utils/prisma');

class SubscriptionRepository {
    async findById(id) {
        return prisma.subscription.findUnique({
            where: { id },
            include: { plan: true, user: true }
        });
    }

    async findFirstByUserId(userId) {
        return prisma.subscription.findFirst({
            where: { userId },
            include: { plan: true }
        });
    }

    async findActiveByUserId(userId) {
        return prisma.subscription.findFirst({
            where: {
                userId,
                status: {
                    in: ['ACTIVE', 'TRIALING', 'PAST_DUE']
                }
            },
            include: { plan: true }
        });
    }

    async findByProviderSubId(providerSubId) {
        return prisma.subscription.findUnique({
            where: { providerSubId },
            include: { plan: true, user: true }
        });
    }

    async findByUserIdAndPlanId(userId, planId) {
        return prisma.subscription.findUnique({
            where: {
                userId_planId: { userId, planId }
            },
            include: { plan: true }
        });
    }

    async create(data) {
        return prisma.subscription.create({
            data,
            include: { plan: true }
        });
    }

    async upsert(userId, planId, createData, updateData) {
        return prisma.subscription.upsert({
            where: {
                userId_planId: { userId, planId }
            },
            create: {
                userId,
                planId,
                ...createData
            },
            update: updateData,
            include: { plan: true }
        });
    }

    async update(id, data) {
        return prisma.subscription.update({
            where: { id },
            data,
            include: { plan: true }
        });
    }

    async updateByProviderSubId(providerSubId, data) {
        return prisma.subscription.update({
            where: { providerSubId },
            data,
            include: { plan: true }
        });
    }

    async list({ page = 1, limit = 10 } = {}) {
        const skip = (page - 1) * limit;
        const [items, total] = await Promise.all([
            prisma.subscription.findMany({
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: { plan: true, user: true }
            }),
            prisma.subscription.count()
        ]);
        return { items, total, page, limit };
    }
}

module.exports = new SubscriptionRepository();
