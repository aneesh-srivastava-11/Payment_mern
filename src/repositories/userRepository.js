const prisma = require('../utils/prisma');

class UserRepository {
    async findById(id) {
        return prisma.user.findUnique({
            where: { id },
            include: { tenant: true }
        });
    }

    async findByEmail(email) {
        return prisma.user.findUnique({
            where: { email },
            include: { tenant: true }
        });
    }

    async create(data) {
        return prisma.user.create({
            data
        });
    }
}

module.exports = new UserRepository();
