const crypto = require('crypto');

const requestId = (req, res, next) => {
    const correlationId = req.headers['x-request-id'] || crypto.randomUUID();
    req.requestId = correlationId;
    res.setHeader('X-Request-Id', correlationId);
    next();
};

module.exports = requestId;
