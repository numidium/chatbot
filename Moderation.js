export default class Moderation {
    static MAX_SPAM_COUNT = 7;
    static COOLDOWN_INTERVAL = 5000;
    static SPAM_TIMEOUT = 10000;
    eventEmitter;
    userHeatValues;
    constructor(eventEmitter_) {
        this.eventEmitter = eventEmitter_;
        this.userHeatValues = {};
    }

    onReceiveChatMessage(self, e) {
        const userId = e.chatter_user_id;
        if (self.userHeatValues[userId] == null) {
            self.userHeatValues[userId] = { spamCount: 1, lastTime: Date.now() };
            return;
        }

        if (Date.now() - self.userHeatValues[userId].lastTime > Moderation.COOLDOWN_INTERVAL) {
            self.userHeatValues[userId].spamCount = 1;
        }
        else {
            const userSpamCount = ++self.userHeatValues[userId].spamCount;
            if (userSpamCount > Moderation.MAX_SPAM_COUNT) {
                self.eventEmitter.emit("userTimeout", userId, Moderation.SPAM_TIMEOUT);
                self.eventEmitter.emit("chatMessageSend", `No spamming, please! @${e.chatter_user_name}`);
            }
        }

        self.userHeatValues[userId].lastTime = Date.now();
    }
}

