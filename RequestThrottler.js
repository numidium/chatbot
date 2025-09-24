export default class RequestThrottler {
    lastRequestTime;
    requestInterval;
    constructor(requestInterval_) {
        this.lastRequestTime = Date.now();
        this.requestInterval = requestInterval_;
    }
    
    update() {
        this.lastRequestTime = Date.now();
    }

    isOnCooldown() {
        return (Date.now()) - this.lastRequestTime < this.requestInterval;
    }
}

