const prisma = require('../utils/prisma');

class InvoiceRepository {
    async findById(id) {
        return prisma.invoice.findUnique({
            where: { id },
            include: { subscription: { include: { plan: true, user: true } } }
        });
    }

    async findByProviderInvoiceId(providerInvoiceId) {
        if (!providerInvoiceId) return null;
        return prisma.invoice.findUnique({
            where: { providerInvoiceId },
            include: { subscription: true }
        });
    }

    async create(data) {
        return prisma.invoice.create({
            data
        });
    }

    async update(id, data) {
        return prisma.invoice.update({
            where: { id },
            data
        });
    }

    async updateByProviderInvoiceId(providerInvoiceId, data) {
        return prisma.invoice.update({
            where: { providerInvoiceId },
            data
        });
    }

    async listByTenant(tenantId, { page = 1, limit = 10 } = {}) {
        const skip = (page - 1) * limit;
        const [items, total] = await Promise.all([
            prisma.invoice.findMany({
                where: { tenantId },
                skip,
                take: limit,
                orderBy: { issuedAt: 'desc' }
            }),
            prisma.invoice.count({ where: { tenantId } })
        ]);
        return { items, total, page, limit };
    }

    async list({ page = 1, limit = 10, tenantId } = {}) {
        const skip = (page - 1) * limit;
        const where = tenantId ? { tenantId } : {};
        const [items, total] = await Promise.all([
            prisma.invoice.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: { subscription: { include: { user: true } } }
            }),
            prisma.invoice.count({ where })
        ]);
        return { items, total, page, limit };
    }
}

module.exports = new InvoiceRepository();
