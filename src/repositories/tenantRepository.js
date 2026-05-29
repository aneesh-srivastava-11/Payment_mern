const prisma = require('../utils/prisma');

class TenantRepository {
    async findById(id) {
        return prisma.tenant.findUnique({
            where: { id }
        });
    }

    async create(data) {
        return prisma.tenant.create({
            data
        });
    }
}

module.exports = new TenantRepository();
