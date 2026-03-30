export default class Chatter {
    static messageTypes = {
        start: 0,
        periodic: 1
    };

    static maxWordLength = 80;
    eventEmitter;
    dbManager;
    macroExpander;
    constructor(eventEmitter_, dbManager_, macroExpander_, chatDelay_) {
        this.eventEmitter = eventEmitter_;
        //const self = this;
        //setInterval(function () { Chatter.retrieveAndSendMessage(self, null, Chatter.messageTypes.periodic); }, chatDelay_);
        this.dbManager = dbManager_; 
        this.macroExpander = macroExpander_;
    }

    getMessage(e, type) { 
        let message = null;
        const rows = this.dbManager.getResultSet(
        `SELECT m.Text 
         FROM Message m
         WHERE m.MessageType = ?
         ORDER BY RANDOM()
         LIMIT 1;`, [type]);
        if (rows && rows.length > 0) {
            if (e != null)
                return this.macroExpander.expand(e, rows[0].Text);
            else
                return rows[0].Text;
        }

        return null;
    }

    digestMarkov(words) {
        for (let i = 0; i < words.length; i++) {
            this.dbManager.runStatement(`INSERT INTO Word (Word) VALUES (?) 
                                         ON CONFLICT (Word)
                                         DO NOTHING;`, [words[i]]);
        }

        for (let i = 0; i < words.length - 1; i++) {
            this.dbManager.runStatement(`INSERT INTO WordVector (FromWordId, ToWordId, Weight) 
                                         VALUES ((SELECT WordId FROM Word WHERE Word = ?), (SELECT WordId FROM Word WHERE Word = ?), 1)
                                         ON CONFLICT (FromWordId, ToWordId)
                                         DO UPDATE SET Weight = Weight + 1;`, [words[i], words[i + 1]]);
        }
    }

    getMarkov(iterationCount) {
        const initialWord = this.dbManager.getResultSet("SELECT FromWordId FROM WordVector ORDER BY RANDOM() LIMIT 1;", []);
        if (initialWord.length < 1) return;
        let wordId = initialWord[0].FromWordId;
        let lastToWordId = 0;
        if (wordId < 1) return;
        const chain = [];
        for (let i = 0; i < iterationCount - 1; i++) {
            const rows = this.dbManager.getResultSet(
            `SELECT wv.FromWordId, wv.ToWordId, w.Word, -LOG(RANDOM()) / wv.Weight as priority
             FROM WordVector wv
             JOIN Word w ON wv.FromWordId = w.WordId
             WHERE wv.FromWordId = ?
             ORDER BY priority
             LIMIT 1;`, [wordId]);
            if (rows.length < 1) break;
            wordId = rows[0].ToWordId;
            chain[i] = rows[0].Word;
        }

        const lastRows = this.dbManager.getResultSet(
        `SELECT Word
         FROM Word w
         WHERE w.WordId = ?
         LIMIT 1;`, [wordId]);
        if (lastRows.length > 0)
            chain.push(lastRows[0].Word);
        return chain;
    }

    sendChatMessage(message) {
        this.eventEmitter.emit("chatMessageSend", { chatMessage: message });
    }

    static retrieveAndSendMessage(self, e, type) {
        self.sendChatMessage(self.getMessage(e, type));
    }

    static getWords(text) {
        return text.replace(/[^a-zA-Z0-9.,?!\s]/g, ' ').toLowerCase().split(" ").filter(Boolean).filter((word) => word.length <= Chatter.maxWordLength);
    }

    onReceiveStreamStartMessage(self, e) {
        Chatter.retrieveAndSendMessage(self, e, Chatter.messageTypes.start);
    }

    onReceiveChatMessage(self, e) {
        const messageText = e.message.text.trim();
        if (messageText[0] != "!")
            self.digestMarkov(Chatter.getWords(messageText));
    }

    onGetWisdom(self, e) {
        self.sendChatMessage(self.getMarkov(e.wordCount).join(" "));
    }
}

