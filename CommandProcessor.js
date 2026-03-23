import Logger from './Logger.js';

export default class CommandProcessor {
    eventEmitter;
    requestThrottler;
    macroExpander;
    dbManager;
    static adminRole = 1;
    static authorRole = 2;
    static hardcodedCommands = {
        addcommand: (self, params, roles) => {
            if (params == null || params.length < 2 || 
                (roles.indexOf(CommandProcessor.adminRole) === -1 && roles.indexOf(CommandProcessor.authorRole) === -1))
                return;
            const commandId = self.dbManager.runStatement("INSERT INTO Command (Text) VALUES (?);", [params[0]]).lastInsertRowid;
            if (commandId > 0) {
                const responseText = params.splice(1).join(" ");
                Logger.log(`addcommand: Inserted command row ${commandId}`);
                const responseId = self.dbManager.runStatement("INSERT INTO Response (CommandId, Text) VALUES (?, ?);", [commandId, responseText]).lastInsertRowid;
                if (responseId > 0) Logger.log(`addcommand: inserted response row ${responseId}`); 
            }
        }, 
        removecommand: (self, params, roles) => {
            if (params == null || params.length < 1 || roles.indexOf(CommandProcessor.adminRole) === -1)
                return;
            const commandResults = 
                self.dbManager.getResultSet(
                    "SELECT c.CommandId FROM Command c JOIN Response r ON r.CommandId = c.CommandId WHERE c.Text = ?;", [params[0]]);
            if (commandResults.length === 0) {
                const commandText = params[0];
                Logger.log(`removecommand: command ${commandText} does not exist.`);
                return;
            }

            const commandId = commandResults[0].CommandId;
            self.dbManager.runStatement(
                "DELETE FROM Response WHERE Response.CommandId = ?;", [commandId]);
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

        if (CommandProcessor.hardcodedCommands.hasOwnProperty(command)) {
            const rows = self.dbManager.getResultSet(
            `SELECT brt.RoleTypeId 
             FROM BotUser bu
             JOIN BotRole br ON br.UserId = bu.UserId
             JOIN BotRoleType brt ON brt.RoleTypeId = br.RoleTypeId
             WHERE bu.ChatUserId = ?;
            `, [e.chatter_user_id]);
            if (!rows || rows.length === 0)
                return;
            const roles = [];
            for (let i = 0; i < rows.length; i++)
                roles[i] = rows[i].RoleTypeId;
            CommandProcessor.hardcodedCommands[command](self, params, roles); 

            return;
        }

        const rows = self.dbManager.getResultSet(
        `SELECT r.Text 
         FROM Command c
         JOIN Response r ON r.CommandId = c.CommandId
         WHERE c.Text = ?`, [command]);
        if (rows && rows.length > 0) {
            const messageText = self.macroExpander.expand(e, rows[Math.floor(Math.random() * rows.length)].Text);
            self.eventEmitter.emit("chatMessageSend", { chatMessage: messageText });
            self.requestThrottler.update();
        }
    }
}

