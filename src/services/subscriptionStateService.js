const logger = require('../utils/logger');

const VALID_TRANSITIONS = {
    INCOMPLETE: ['ACTIVE', 'TRIALING', 'CANCELED', 'INCOMPLETE'],
    TRIALING: ['ACTIVE', 'PAST_DUE', 'CANCELED', 'PAUSED', 'TRIALING'],
    ACTIVE: ['PAST_DUE', 'CANCELED', 'PAUSED', 'ACTIVE'],
    PAST_DUE: ['ACTIVE', 'CANCELED', 'EXPIRED', 'UNPAID', 'PAST_DUE'],
    PAUSED: ['ACTIVE', 'CANCELED', 'PAUSED'],
    CANCELED: ['ACTIVE', 'CANCELED'], // Stripe/Razorpay allow resubscribing or updating cancel at period end
    EXPIRED: ['ACTIVE', 'EXPIRED'],
    UNPAID: ['ACTIVE', 'CANCELED', 'UNPAID']
};

class SubscriptionStateService {
    isValidTransition(currentState, nextState) {
        if (!currentState) return true; // Initial creation
        
        const allowedNextStates = VALID_TRANSITIONS[currentState];
        if (!allowedNextStates) {
            return false;
        }
        return allowedNextStates.includes(nextState);
    }

    validateAndTransition(subscriptionId, currentState, nextState) {
        logger.info(`Subscription ${subscriptionId} transitioning: ${currentState} -> ${nextState}`);
        if (!this.isValidTransition(currentState, nextState)) {
            logger.warn(`Invalid state transition detected for subscription ${subscriptionId}: ${currentState} -> ${nextState}`);
            throw new Error(`Invalid state transition: ${currentState} to ${nextState}`);
        }
        return nextState;
    }
}

module.exports = new SubscriptionStateService();
