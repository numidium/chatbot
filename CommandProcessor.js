export default class CommandProcessor {
    eventEmitter;
    requestThrottler;
    static pokeResponses = ["Ow!", "Cut it out!", "Stop it!", "Ouch!", "That hurts!"];

    constructor(eventEmitter_, requestThrottler_) {
        this.eventEmitter = eventEmitter_;
        this.requestThrottler = requestThrottler_;
    }

    onReceiveChatMessage(self, e) {
        if (self.requestThrottler.isOnCooldown() || !e.message.text.startsWith("!"))
            return;
        const messageText = e.message.text.toLowerCase();
        const command = e.message.text.substring(1).split(" ")[0];
        if (command === "poke" || command === "stab" || command === "bash" || command === "slash") {
            self.eventEmitter.emit("chatMessageSend", CommandProcessor.pokeResponses[Math.floor(Math.random() * CommandProcessor.pokeResponses.length)]);
        }

        self.requestThrottler.update();
    }
}

