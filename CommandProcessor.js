import Logger from './Logger.js';

export default class CommandProcessor {
    eventEmitter;
    requestThrottler;
    dbManager;
    macroExpander;
    static adminRole = 1;
    static authorRole = 2;
    static hardcodedCommands = {
        addcommand: (self, params, roles) => {
            if (params == null || params.length < 2 || 
                (roles.indexOf(CommandProcessor.adminRole) === -1 && roles.indexOf(CommandProcessor.authorRole) === -1))
                return;
            const database = new self.dbManager.sqlite.Database(self.dbManager.dbPath, (err) => {
                if (err) Logger.error(err.message); 
            });
            
            let commandId = 0;
            let responseId = 0;
            let responseText = params.splice(1).join(" ");
            self.dbManager.asyncGet(database, 
                "INSERT INTO Command (Text) VALUES (?) RETURNING ROWID;", [params[0]])
            .then((row) => {
                if (row) {
                    commandId = row.CommandId;
                    Logger.log(`INSERT: Command ${row.CommandId}`);
                }

                return self.dbManager.asyncGet(database,
                "INSERT INTO Response (CommandId, Text) VALUES (?, ?) RETURNING ROWID;", [commandId, responseText]);
            }, (err) => { Logger.error(err); })
            .then((row) => {
                if (row)
                    Logger.log(`INSERT: Response ${row.ResponseId}`); 
                database.close();
            }, (err) => { Logger.error(err); });
        }, 
        removecommand: (self, params, roles) => {
            if (params == null || params.length < 1 || roles.indexOf(CommandProcessor.adminRole) === -1)
                return;
            const database = new self.dbManager.sqlite.Database(self.dbManager.dbPath, (err) => {
                if (err) Logger.error(err.message);
            });

            let commandId = 0;
            self.dbManager.asyncGet(database,
                "SELECT c.CommandId FROM Command c JOIN Response r ON r.CommandId = c.CommandId WHERE c.Text = ?;",
                [params[0]])
            .then((row) => {
                if (row)
                    commandId = row.CommandId;
                return self.dbManager.asyncRun(database,
                "DELETE FROM Response WHERE CommandId = ?;",
                [commandId]);
            })
            .then(() => {
                return self.dbManager.asyncRun(database,
                "DELETE FROM Command WHERE CommandId = ?;",
                [commandId]);
            })
            .then(() => {
                if (commandId > 0)
                    Logger.log(`DELETE: Command ${commandId}`);
                else
                    Logger.log(`DELETE: No Command with key "${params[0]}"`);
                database.close();
            });
        },
        addSpamTerm: (self, params, roles) => {
            if (params == null || params.length < 1 || roles.indexOf(CommandProcessor.adminRole) === -1)
                return;
            self.eventEmitter("spamTermAdd", params[0]);
        }
    };

    constructor(eventEmitter_, requestThrottler_, dbManager_, macroExpander_) {
        this.eventEmitter = eventEmitter_;
        this.requestThrottler = requestThrottler_;
        this.dbManager = dbManager_;
        this.macroExpander = macroExpander_;
    }

    onReceiveChatMessage(self, e) {
        if (self.requestThrottler.isOnCooldown() || !e.message.text.startsWith("!"))
            return;
        const messageText = e.message.text;
        const messageParts = messageText.substring(1).split(" ");
        const command = messageParts[0].toLowerCase();
        const params = messageParts.splice(1);
        const database = new self.dbManager.sqlite.Database(self.dbManager.dbPath, (err) => {
            if (err) Logger.error(err);
        });

        if (CommandProcessor.hardcodedCommands.hasOwnProperty(command)) {
            self.dbManager.asyncAll(database,
            `SELECT brt.RoleTypeId 
             FROM BotUser bu
             JOIN BotRole br ON br.UserId = bu.UserId
             JOIN BotRoleType brt ON brt.RoleTypeId = br.RoleTypeId
             WHERE bu.ChatUserId = ?;
            `, [e.chatter_user_id])
            .then((rows) => {
                database.close();
                if (!rows)
                    return;
                const roles = [];
                for (let i = 0; i < rows.length; i++)
                    roles[i] = rows[i].RoleTypeId;
                CommandProcessor.hardcodedCommands[command](self, params, roles); 
            });

            return;
        }

        self.dbManager.asyncAll(database,
        `SELECT r.Text 
         FROM Command c
         JOIN Response r ON r.CommandId = c.CommandId
         WHERE c.Text = ?`, [command])
         .then((rows) => {
            if (rows && rows.length > 0) {
                const messageText = self.macroExpander.expand(e, rows[Math.floor(Math.random() * rows.length)].Text);
                self.eventEmitter.emit("chatMessageSend", { chatMessage: messageText });
                self.requestThrottler.update();
            }

            database.close();
        }); 
    }
}

