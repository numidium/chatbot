export default class Moderation {
    static MAX_SPAM_COUNT = 7;
    static COOLDOWN_INTERVAL = 5000;
    static SPAM_TIMEOUT = 20;
    eventEmitter;
    userHeatValues;
    moderatorId;
    constructor(eventEmitter_, moderatorId_) {
        this.eventEmitter = eventEmitter_;
        this.moderatorId = moderatorId_;
        this.userHeatValues = {};
    }

    onReceiveChatMessage(self, e) {
        const userId = e.chatter_user_id;
        if (userId === self.moderatorId)
            return;
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
                self.eventEmitter.emit("userTimeout", { userId: userId, duration: Moderation.SPAM_TIMEOUT });
                self.eventEmitter.emit("chatMessageSend", { chatMessage: `No spamming, please! @${e.chatter_user_name}` });
            }
        }

        self.userHeatValues[userId].lastTime = Date.now();
    }
}

