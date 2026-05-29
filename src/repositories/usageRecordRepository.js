const prisma = require('../utils/prisma');

class UsageRecordRepository {
    async create(data) {
        return prisma.usageRecord.create({
            data
        });
    }

    async findByTenantId(tenantId, { page = 1, limit = 10 } = {}) {
        const skip = (page - 1) * limit;
        const [items, total] = await Promise.all([
            prisma.usageRecord.findMany({
                where: { tenantId },
                skip,
                take: limit,
                orderBy: { timestamp: 'desc' }
            }),
            prisma.usageRecord.count({ where: { tenantId } })
        ]);
        return { items, total, page, limit };
    }

    async getAggregatedUsage(tenantId, action, since) {
        const result = await prisma.usageRecord.aggregate({
            _sum: {
                usage: true
            },
            where: {
                tenantId,
                action,
                timestamp: {
                    gte: since
                }
            }
        });
        return result._sum.usage || 0;
    }
}

module.exports = new UsageRecordRepository();
