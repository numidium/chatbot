import express from 'express';
import WebSocket from 'ws';
import { EventEmitter } from 'node:events';
import RequestThrottler from './RequestThrottler.js';
import AntiBot from './AntiBot.js';
import DatabaseManager from './DatabaseManager.js';
import CommandProcessor from './CommandProcessor.js';
import Moderation from './Moderation.js';
import MacroExpander from './MacroExpander.js';
import Logger from './Logger.js';
import https from 'https';
import fs from 'fs';
import sqlite3 from 'sqlite3';
import process from 'node:process';

process.on("uncaughtException", (err, origin) => {
    Logger.error(`Uncaught Exception: ${err}\nOrigin: ${origin}`);
    process.exit(1);
});

const privateKey = fs.readFileSync("../raspberrypi-key.pem", "utf-8");
const certificate = fs.readFileSync("../raspberrypi.pem", "utf-8");
const httpsOptions = { key: privateKey, cert: certificate };
const app = express();
const HOST_NAME = "localhost";
const PORT = 3001;
let authCode = "";

app.get("/", async (req, res) => {
    Logger.log(req.query);
    Logger.log(`Auth Code: ${req.query.code}`);
    authCode = req.query.code;
    await botStart();
    res.sendStatus(200);
});

https.createServer(httpsOptions, app).listen(PORT, () => {
    Logger.log(`Chat bot server listening on port ${PORT}`);
});

const BOT_USER_ID = "1366238110";
const CLIENT_ID = "DUMMY_CLIENT_ID";
const CLIENT_SECRET = "DUMMY_CLIENT_SECRET";
const BROADCASTER_USER_ID = "66293282";
const EVENTSUB_WEBSOCKET_URL = "wss://eventsub.wss.twitch.tv/ws";
const REQUEST_INTERVAL = 3000;
const eventTypes = {
    receivedChatMessage: "channel.chat.message",
    chatMessageSend: "chatMessageSend",
    chatMessageDelete: "chatMessageDelete",
    userTimeout: "userTimeout",
    spamTermAdd: "spamTermAdd"
};

const eventEmitter = new EventEmitter();
const requestThrottler = new RequestThrottler(REQUEST_INTERVAL);
const dbManager = new DatabaseManager(sqlite3, "./db/chatbot.db");
const macroExpander = new MacroExpander(dbManager);
const commandProcessor = new CommandProcessor(eventEmitter, requestThrottler, dbManager, macroExpander);
const antiBot = new AntiBot(eventEmitter, requestThrottler, dbManager);
const moderation = new Moderation(eventEmitter, BOT_USER_ID);

let accessToken;
let refreshToken;
let websocketSessionID;
let wsClient;

async function botStart() {
    await getToken();
    wsClient = startWebSocketClient(EVENTSUB_WEBSOCKET_URL);
}

async function getToken() {
    const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&code=${authCode}&grant_type=authorization_code&redirect_uri=https://${HOST_NAME}:${PORT}/`, { method: "POST" });
    if (response.status != 200) {
        let data = await response.json();
        Logger.error("Invalid authorization code: " + response.status);
        Logger.error(data);
        process.exit(1);
    }
    else {
        const responseJson = await response.json();
        accessToken = responseJson.access_token;
        refreshToken = responseJson.refresh_token;
        Logger.log(`Retrieved token. Access: ${accessToken} Refresh: ${refreshToken}`);
    }
}

async function refreshCurrentToken() {
    const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=refresh_token&refresh_token=${refreshToken}`, { method: "POST" });
    if (response.status >= 400) {
        let data = await response.json();
        Logger.error(`Could not refresh token: ${response.status} ${data.message}`);
        process.exit(1);
    }
    else {
        const responseJson = await response.json();
        accessToken = responseJson.access_token;
        refreshToken = responseJson.refresh_token;
        Logger.log("Token refresh successful.");
    }
}

function startWebSocketClient(url) {
    let websocketClient = new WebSocket(url);
    websocketClient.on("error", (e) => {
        Logger.error(e);
    });

    websocketClient.on("open", () => {
        Logger.log("WebSocket connection opened to " + url);
    });

    websocketClient.on("ping", (data) => {
        websocketClient.pong();
    });

    websocketClient.on("message", (data) => {
        handleWebSocketMessage(JSON.parse(data.toString()));
    });

    websocketClient.on("reconnect", (data) => {
        handleWebSocketMessage(JSON.parse(data.toString()));
    });

    websocketClient.on("close", (data) => {
        handleWebSocketMessage(JSON.parse(data.toString()));
    });

    return websocketClient;
}

function handleWebSocketMessage(data) {
    if (data.metadata == null) {
        Logger.error(data);
        return;
    }

    switch (data.metadata.message_type) {
        case "session_welcome": // First message you get from the WebSocket server when connecting
            websocketSessionID = data.payload.session.id; // Register the Session ID it gives us
            Logger.log(`Session welcome received. ID: ${websocketSessionID}`);
            registerEventSubListeners();
            break;
        case "notification":
            switch (data.metadata.subscription_type) {
                case eventTypes.receivedChatMessage:
                    eventEmitter.emit(eventTypes.receivedChatMessage, data.payload.event);
                    break;
                default:
                    break;
            }

            break;
        case "session_reconnect":
            Logger.log(`Receieved session reconnect at ${data.metadata.message_timestamp}`);
            websocketSessionID = data.payload.session.id;
            refreshCurrentToken().then(() => {
                wsClient = startWebSocketClient(data.payload.session.reconnect_url);
            });

            break;
        case "close":
            Logger.log(`Socket closed. Code: ${data.code}, reason ${data.reason}`);
            break;
        default:
            break;
    }
}

async function registerEventSubListeners() {
    let response = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + encodeURIComponent(accessToken),
            "Client-Id": CLIENT_ID,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            type: eventTypes.receivedChatMessage,
            version: "1",
            condition: {
                broadcaster_user_id: BROADCASTER_USER_ID,
                user_id: BOT_USER_ID
            },
            transport: {
                method: "websocket",
                session_id: websocketSessionID
            }
        })
    });

    if (response.status >= 400) {
        let data = await response.json();
        Logger.error(`Failed to subscribe to ${eventTypes.receivedChatMessage}. API call returned status code ${response.status}`);
        Logger.error(data);
        process.exit(1);
    } else {
        const data = await response.json();
        Logger.log(`Subscribed to ${eventTypes.receivedChatMessage} [${data.data[0].id}]`);
    }
}

async function onSendChatMessage(chatMessage) {
    const response = await fetch("https://api.twitch.tv/helix/chat/messages", {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + encodeURIComponent(accessToken),
            "Client-Id": CLIENT_ID,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            broadcaster_id: BROADCASTER_USER_ID,
            sender_id: BOT_USER_ID,
            message: chatMessage
        })
    });

    if (response.status != 200) {
        const data = await response.json();
        Logger.error("Failed to send chat message.");
        Logger.error(data);
        if (response.status >= 400)
            await refreshCurrentToken();
    }
    else {
        Logger.log("Chat: " + chatMessage);
    }
}

async function onDeleteChatMessage(e) {
    const response = await fetch("https://api.twitch.tv/helix/moderation/chat", {
        method: "DELETE",
        headers: {
            "Authorization": "Bearer " + encodeURIComponent(accessToken),
            "Client-Id": CLIENT_ID,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            broadcaster_id: BROADCASTER_USER_ID,
            moderator_id: BOT_USER_ID,
            message_id: e.message_id
        })
    });

    if (response.status >= 400) {
        const data = await response.json();
        Logger.error(`Failed to delete chat message: ${e.message_id}`);
        Logger.error(data);
        if (response.status === 401)
            await refreshCurrentToken();
    }
    else {
        Logger.log(`Deleted chat message: ${e.message_id}`);
    }
}

async function onTimeoutUser(userId, duration) {
    const response = await fetch(`https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${BROADCASTER_USER_ID}&moderator_id=${BOT_USER_ID}`, {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + encodeURIComponent(accessToken),
            "Client-Id": CLIENT_ID,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            data: {
                user_id: userId,
                duration: duration
            }
        })
    });

    if (response.status >= 400) {
        const data = await response.json();
        Logger.error(`Failed to timeout user: ${userId}`);
        Logger.error(data);
        if (response.status === 401)
            await refreshCurrentToken();
    }
    else {
        Logger.log(`Timed out user: ${userId}`);
    }
}

eventEmitter.on(eventTypes.receivedChatMessage, (e) => { commandProcessor.onReceiveChatMessage(commandProcessor, e); });
eventEmitter.on(eventTypes.receivedChatMessage, (e) => { antiBot.onReceiveChatMessage(antiBot, e); });
eventEmitter.on(eventTypes.spamTermAdd, (e) => { antiBot.onSpamTermAdd(antiBot, e); });
eventEmitter.on(eventTypes.receivedChatMessage, (e) => { moderation.onReceiveChatMessage(moderation, e); });
eventEmitter.on(eventTypes.chatMessageSend, onSendChatMessage);
eventEmitter.on(eventTypes.chatMessageDelete, onDeleteChatMessage);
eventEmitter.on(eventTypes.userTimeout, onTimeoutUser);

