const prisma = require('../utils/prisma');

class CustomerRepository {
    async findByUserIdAndProvider(userId, provider) {
        return prisma.customer.findUnique({
            where: {
                userId_provider: {
                    userId,
                    provider
                }
            }
        });
    }

    async findByProviderCustomerId(providerCustomerId) {
        return prisma.customer.findUnique({
            where: { providerCustomerId },
            include: { user: true }
        });
    }

    async create(data) {
        return prisma.customer.create({
            data
        });
    }
}

module.exports = new CustomerRepository();
