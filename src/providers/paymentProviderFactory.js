const stripeAdapter = require('./stripeAdapter');
const razorpayAdapter = require('./razorpayAdapter');
const mockStripeAdapter = require('./mockStripeAdapter');
const logger = require('../utils/logger');

class PaymentProviderFactory {
    getProvider(providerName) {
        const name = (providerName || process.env.DEFAULT_PAYMENT_PROVIDER || 'mock').toLowerCase();
        
        switch (name) {
            case 'stripe':
                return stripeAdapter;
            case 'razorpay':
                return razorpayAdapter;
            case 'mock':
            case 'mockstripe':
                return mockStripeAdapter;
            default:
                logger.warn(`Unknown provider '${providerName}', falling back to Mock provider`);
                return mockStripeAdapter;
        }
    }
}

module.exports = new PaymentProviderFactory();
