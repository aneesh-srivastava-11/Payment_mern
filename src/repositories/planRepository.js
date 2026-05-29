const prisma = require('../utils/prisma');

class PlanRepository {
    async findById(id) {
        return prisma.plan.findUnique({
            where: { id }
        });
    }

    async create(data) {
        return prisma.plan.create({
            data
        });
    }

    async list() {
        return prisma.plan.findMany();
    }
}

module.exports = new PlanRepository();
