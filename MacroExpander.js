export default class MacroExpander {
    dbManager;
    constructor(dbManager_) {
        this.dbManager = dbManager_;
    }

    expand(e, messageText) {
        let outText = messageText;
        if (messageText.indexOf("%chatter%") !== -1 && e.chatter_user_name != null) {
            outText = outText.replaceAll("%chatter%", e.chatter_user_name);
        }
        
        if (messageText.indexOf("%type%") !== -1 && e.type != null) {
            outText = outText.replaceAll("%type%", e.type);
        }

        return outText;
    }
}
