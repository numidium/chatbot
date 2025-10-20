import { EventEmitter } from 'node:events';
import RequestThrottler from './RequestThrottler.js';
import CommandProcessor from './commandProcessor.js';
import DatabaseManager from './DatabaseManager.js';
import MacroExpander from './MacroExpander.js';
import sqlite3 from 'sqlite3';

const eventEmitter = new EventEmitter();
const requestThrottler = new RequestThrottler(3000);
requestThrottler.lastRequestTime = 0;
const dbManager = new DatabaseManager(sqlite3, "./db/test.db");
const macroExpander = new MacroExpander(dbManager);
const commandProcessor = new CommandProcessor(eventEmitter, requestThrottler, dbManager, macroExpander);

eventEmitter.on("chatMessageSend", (e) => { console.log(e); });

// Try to use a non-existant command.
commandProcessor.onReceiveChatMessage(commandProcessor, {
    chatter_user_name: "admin",
    chatter_user_id: 66666666,
    message: {
        text: "!fakecommand" 
    }
});

// Add a command with admin role.
commandProcessor.onReceiveChatMessage(commandProcessor, {
    chatter_user_name: "admin",
    chatter_user_id: 66666666,
    message: {
        text: "!addcommand test This is a test command." 
    }
});

// Add a command with author role.
commandProcessor.onReceiveChatMessage(commandProcessor, {
    chatter_user_name: "author",
    chatter_user_id: 10101010,
    message: {
        text: "!AddCommand imanauthor I am a command author."
    }
});

// Try to add a command with no roles.
commandProcessor.onReceiveChatMessage(commandProcessor, {
    chatter_user_name: "interloper",
    chatter_user_id: 0,
    message: {
        text: "!addcommand imnotanauthor This should NOT appear in the db."
    }
});

// Try to remove a command with no roles.
commandProcessor.onReceiveChatMessage(commandProcessor, {
    chatter_user_name: "interloper 2",
    chatter_user_id: 1,
    message: {
        text: "!removecommand poke"
    }
});

// Try to remove a command without the admin role.
commandProcessor.onReceiveChatMessage(commandProcessor, {
    chatter_user_name: "author",
    chatter_user_id: 10101010,
    message: {
        text: "!removecommand poke"
    }
});

// Remove an existing command.
commandProcessor.onReceiveChatMessage(commandProcessor, {
    chatter_user_name: "admin",
    chatter_user_id: 66666666,
    message: {
        text: "!RemoveCommand meaningoflife"
    }
});

// Use an existing command that contains macro text.
commandProcessor.onReceiveChatMessage(commandProcessor, {
    chatter_user_name: "admin",
    chatter_user_id: 66666666,
    message: {
        text: "!openpodbaydoor"
    }
});

// Try to remove non-existant command.
commandProcessor.onReceiveChatMessage(commandProcessor, {
    chatter_user_name: "admin",
    chatter_user_id: 66666666,
    message: {
        text: "!removecommand nonexistent"
    }
});

