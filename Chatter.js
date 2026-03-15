export default class Chatter {
    static messageTypes = {
        start: 0,
        periodic: 1
    };

    eventEmitter;
    dbManager;
    macroExpander;
    constructor(eventEmitter_, dbManager_, macroExpander_, chatDelay_) {
        this.eventEmitter = eventEmitter_;
        let self = this;
        //setInterval(function () { Chatter.retrieveAndSendMessage(self, null, Chatter.messageTypes.periodic); }, chatDelay_);
        this.dbManager = dbManager_; 
        this.macroExpander = macroExpander_;
    }

    getMessage(e, type, onResolve) { 
        const database = new this.dbManager.sqlite.Database(this.dbManager.dbPath, (err) => {
            if (err) Logger.error(err.message); 
        });
        
        let message = null;
        return this.dbManager.asyncAll(database,
        `SELECT m.Text 
         FROM Message m
         WHERE m.MessageType = ?
         ORDER BY RANDOM()
         LIMIT 1;`, [type])
         .then((rows) => {
            database.close();
            if (rows && rows.length > 0) {
                if (e != null)
                    message = this.macroExpander.expand(e, rows[0].Text);
                else
                    message = rows[0].Text;
            }

            onResolve(message);
        });
    }

    digestWords(words) {
    }

    sendChatMessage(message) {
        this.eventEmitter.emit("chatMessageSend", { chatMessage: message });
    }

    static retrieveAndSendMessage(self, e, type) {
        self.getMessage(e, type, (message) => {
            self.sendChatMessage(message);
        });
    }

    onReceiveStreamStartMessage(self, e) {
        Chatter.retrieveAndSendMessage(self, e, Chatter.messageTypes.start);
    }
}

