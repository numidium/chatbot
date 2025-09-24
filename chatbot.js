import express from 'express';
import WebSocket from 'ws';
import { EventEmitter } from 'node:events';
import RequestThrottler from './RequestThrottler.js';
import AntiBot from './AntiBot.js';
import CommandProcessor from './CommandProcessor.js';

const app = express();
const HOST_NAME = "localhost";
const PORT = 3001;
let authCode = "";

app.get("/", async (req, res) => {
    console.log(req.query);
    console.log(`Auth Code: ${req.query.code}`);
    authCode = req.query.code;
    await botStart();
    res.sendStatus(200);
});

app.listen(PORT, () => {
    console.log(`Chat bot server listening on port ${PORT}`);
});

const BOT_USER_ID = "1366238110";
const CLIENT_ID = "DUMMY_CLIENT_ID";
const CLIENT_SECRET = "DUMMY_CLIENT_SECRET";
const BROADCASTER_USER_ID = "66293282"; // This is the User ID of the channel that the bot will join and listen to chat messages of
const EVENTSUB_WEBSOCKET_URL = "wss://eventsub.wss.twitch.tv/ws";
const REQUEST_INTERVAL = 3000;
const eventTypes = {
    receivedChatMessage: "channel.chat.message",
    chatMessageSend: "chatMessageSend",
    chatMessageDelete: "chatMessageDelete",
    userTimeout: "userTimeout"
};

const eventEmitter = new EventEmitter();
const requestThrottler = new RequestThrottler(REQUEST_INTERVAL);
const commandProcessor = new CommandProcessor(eventEmitter, requestThrottler);
const antiBot = new AntiBot(eventEmitter, requestThrottler);
const moderation = new Moderation(eventEmitter);

let accessToken;
let refreshToken;
let websocketSessionID;

async function botStart() {
    await getToken();
    const websocketClient = startWebSocketClient();
}

async function getToken() {
    const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&code=${authCode}&grant_type=authorization_code&redirect_uri=http://${HOST_NAME}:${PORT}/`, { method: "POST" });
    if (response.status != 200) {
        let data = await response.json();
        console.error("Invalid authorization code: " + response.status);
        console.error(data);
        process.exit(1);
    }
    else {
        const responseJson = await response.json();
        accessToken = responseJson.access_token;
        refreshToken = responseJson.refresh_token;
        console.log(`Retrieved token. Access: ${accessToken} Refresh: ${refreshToken}`);
    }
}

async function refreshCurrentToken() {
    const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=refresh_token&refresh_token=${refreshToken}`, { method: "POST" });
    if (response.status >= 400) {
        let data = await response.json();
        console.error(`Could not refresh token: ${response.status} ${data.message}`);
        process.exit(1);
    }
    else {
        const responseJson = await response.json();
        accessToken = responseJson.access_token;
        refreshToken = responseJson.refresh_token;
        console.log("Token refresh successful.");
    }
}

function startWebSocketClient() {
    let websocketClient = new WebSocket(EVENTSUB_WEBSOCKET_URL);
    websocketClient.on("error", console.error);
    websocketClient.on("open", () => {
        console.log("WebSocket connection opened to " + EVENTSUB_WEBSOCKET_URL);
    });

    websocketClient.on("message", (data) => {
        handleWebSocketMessage(JSON.parse(data.toString()));
    });

    return websocketClient;
}

function handleWebSocketMessage(data) {
    switch (data.metadata.message_type) {
        case "session_welcome": // First message you get from the WebSocket server when connecting
            websocketSessionID = data.payload.session.id; // Register the Session ID it gives us
            console.log(`Session ID: ${websocketSessionID}`);
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
        default:
            break;
    }
}

async function registerEventSubListeners() {
    let response = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + accessToken,
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
        console.error(`Failed to subscribe to ${eventTypes.receivedChatMessage}. API call returned status code ${response.status}`);
        console.error(data);
        process.exit(1);
    } else {
        const data = await response.json();
        console.log(`Subscribed to ${eventTypes.receivedChatMessage} [${data.data[0].id}]`);
    }
}

async function onSendChatMessage(chatMessage) {
    const response = await fetch("https://api.twitch.tv/helix/chat/messages", {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + accessToken,
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
        console.error("Failed to send chat message.");
        console.error(data);
        if (response.status === 401)
            await refreshCurrentToken();
    }
    else {
        console.log("Sent chat message: " + chatMessage);
    }
}

async function onDeleteChatMessage(e) {
    const response = await fetch("https://api.twitch.tv/helix/moderation/chat", {
        method: "DELETE",
        headers: {
            "Authorization": "Bearer " + accessToken,
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
        console.error(`Failed to delete chat message: ${e.message_id}`);
        console.error(data);
        if (response.status === 401)
            await refreshCurrentToken();
    }
    else {
        console.log(`Deleted chat message: ${e.message_id}`);
    }
}

async function onTimeoutUser(userId, duration) {
    const response = await fetch(`https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${BROADCASTER_USER_ID}&moderator_id=${BOT_USER_ID}`, {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + accessToken,
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
        console.error(`Failed to timeout user: ${data.user_id}`);
        if (response.status === 401)
            await refreshCurrentToken();
    }
    else {
        console.log(`Timed out user: ${data.user_id}`);
    }
}

eventEmitter.on(eventTypes.receivedChatMessage, (e) => { commandProcessor.onReceiveChatMessage(commandProcessor, e); });
eventEmitter.on(eventTypes.receivedChatMessage, (e) => { antiBot.onReceiveChatMessage(antiBot, e); });
eventEmitter.on(eventTypes.receivedChatMessage, (e) => { moderation.onReceiveChatMessage(moderation, e); });
eventEmitter.on(eventTypes.chatMessageSend, onSendChatMessage);
eventEmitter.on(eventTypes.chatMessageDelete, onDeleteChatMessage);
EventEmitter.on(eventTypes.userTimeout, onTimeoutUser);

