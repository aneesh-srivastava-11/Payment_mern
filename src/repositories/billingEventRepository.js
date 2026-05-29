const prisma = require('../utils/prisma');

class BillingEventRepository {
    async findByProviderEventId(providerEventId) {
        if (!providerEventId) return null;
        return prisma.billingEvent.findUnique({
            where: { providerEventId }
        });
    }

    async create(data) {
        return prisma.billingEvent.create({
            data
        });
    }

    async markProcessed(id) {
        return prisma.billingEvent.update({
            where: { id },
            data: { processed: true }
        });
    }

    async list({ page = 1, limit = 10 } = {}) {
        const skip = (page - 1) * limit;
        const [items, total] = await Promise.all([
            prisma.billingEvent.findMany({
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' }
            }),
            prisma.billingEvent.count()
        ]);
        return { items, total, page, limit };
    }
}

module.exports = new BillingEventRepository();
