export default class AntiBot {
    eventEmitter;
    requestThrottler;
    static deleteMessages = ["I'm the only bot allowed here!",
        "Take your cheap viewers elsewhere!",
        "Not interested!",
        "SwiftRage BOT!",
        "DansGame FBBlock MrDestructoid"];

    constructor(eventEmitter_, requestThrottler_) {
        this.eventEmitter = eventEmitter_;
        this.requestThrottler = requestThrottler_;
    }

    onReceiveChatMessage(self, e) {
        const botThreshold = 3;
        const messageText = e.message.text.trim().toLowerCase();
        let botScore = 0;
        if (messageText.includes("cheap"))
            botScore++;
        if (messageText.includes("viewers"))
            botScore++;
        if (messageText.includes("stream"))
            botScore++;
        if (messageText.includes("boo"))
            botScore++;
        if (botScore >= botThreshold) {
            self.eventEmitter.emit("chatMessageDelete", data.payload.event);
            if (self.requestThrottler.isOnCooldown())
                return;
            self.eventEmitter.emit("chatMessageSend", self.deleteMessages[Math.floor(Math.random() * self.deleteMessages.length)]);
            self.requestThrottler.update();
            return;
        }
    }
}

