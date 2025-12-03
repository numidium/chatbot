import Logger from './Logger.js';

export default class AntiBot {
    eventEmitter;
    requestThrottler;
    dbManager;
    spamTermCache;
    static deleteMessages = ["I'm the only bot allowed here!",
        "Take your cheap viewers elsewhere!",
        "Not interested!",
        "SwiftRage BOT!",
        "DansGame FBBlock MrDestructoid"];

    constructor(eventEmitter_, requestThrottler_, dbManager_) {
        this.eventEmitter = eventEmitter_;
        this.requestThrottler = requestThrottler_;
        this.dbManager = dbManager_;
    }

    deleteIfThresholdMet(self, botScore, botThreshold, e) {
         if (botScore >= botThreshold) {
            self.eventEmitter.emit("chatMessageDelete", e);
            if (self.requestThrottler.isOnCooldown())
                return;
            self.eventEmitter.emit("chatMessageSend", { chatMessage: AntiBot.deleteMessages[Math.floor(Math.random() * AntiBot.deleteMessages.length)] });
            self.requestThrottler.update();
            return;
        }   
    }

    onReceiveChatMessage(self, e) {
        const botThreshold = 3;
        let botScore = 0;
        const diacriticPattern = /[\u0300-\u036f]/g;
        const normalizedText = e.message.text.trim().toLowerCase().normalize("NFD");
        if (normalizedText.match(diacriticPattern))
            botScore++;
        const messageText = normalizedText.replace(diacriticPattern, "");

        if (!self.spamTermCache) {
            const database = new this.dbManager.sqlite.Database(this.dbManager.dbPath, (err) => {
                if (err) Logger.error(err.message);
            });

            this.dbManager.asyncAll(database, "SELECT Text FROM SpamTerms;").then((rows) => {
                database.close();
                self.spamTermCache = new Array(rows.length);
                for (let i = 0; i < rows.length; i++)
                    self.spamTermCache[i] = rows[i].Text;
                for (let i = 0; i < self.spamTermCache.length; i++) {
                    if (messageText.includes(self.spamTermCache[i]))
                        botScore++;
                }

                self.deleteIfThresholdMet(self, botScore, botThreshold, e);
            });
        }
        else {
            for (let i = 0; i < self.spamTermCache.length; i++) {
                if (messageText.includes(self.spamTermCache[i]))
                    botScore++;
            }

            self.deleteIfThresholdMet(self, botScore, botThreshold, e);
        }
    }

    onSpamTermAdd(self, term) {
       self.spamTermCache[self.spamTermCache.length] = term;
       const database = new self.dbManager.sqlite.Database(self.dbManager.dbPath, (err) => { if (err) Logger.error(err.message); });
       self.dbManager.asyncRun(database, "INSERT INTO SpamTerms (Text) VALUES (?);", [term]).then();
    }
}

