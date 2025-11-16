const BASE_URL = "localhost:8000";
const BASE_HTTP = "http://" + BASE_URL + "/api/";
const BASE_WS = "ws://" + BASE_URL + "/ws/";

CHATS = [];
CURRENT_CHAT = null;
CHAT_MESSAGES = {};
TOKEN = null;
USER_ID = 0;
USER = null;
EDITING_MESSAGE = null;

const Requests = {
    async tokenizedRequest(endpoint, properties) {
        return await fetch(BASE_HTTP + endpoint, {
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + TOKEN,
            },
            ...properties,
        });
    },
    async token(username, password) {
        const res = await fetch(BASE_HTTP + "users/token/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                username: username,
                password: password,
            }),
        });
        if (res.ok) {
            const json = await res.json();
            $("#token").val((TOKEN = json.access));
            return TOKEN;
        }
        return null;
    },
    async me(token) {
        const res1 = await Requests.tokenizedRequest("users/me", {
            method: "GET",
        });
        if (!res1.ok) {
            $("#status_element").text("Error: " + res1.statusText);
            return null;
        }
        const json = await res1.json();
        USER_ID = json.id;
        USER = json;
        $("#user_id").text(USER_ID);
        return json;
    },
    async chatList() {
        const res = await Requests.tokenizedRequest("chat/?reverse=true", {
            method: "GET",
        });
        if (!res.ok) {
            $("#status_element").text("Get chats: " + res.statusText);
            return [];
        }
        CHATS = await res.json();
        return CHATS;
    },
    async messages(chatId) {
        const res = await Requests.tokenizedRequest(
            "chat/message/?chat=" + chatId,
            { method: "GET" }
        );
        if (!res.ok) {
            $("#status_element").text("Get messages: " + res.statusText);
            return [];
        }
        const msgs = await res.json();
        CHAT_MESSAGES[chatId + ""] = msgs;
        return msgs;
    },
};

const Templates = {
    chatElement(chat) {
        return `
<div class="chat-element" chat-id="${chat.id}">
    <span>${chat.name}</span>
</div>`;
    },
    message(message) {
        const base = `
<div class="message${message.user.id == USER_ID ? "-self" : ""}" 
        message-id="${message.id}"
    >
    <span>${
        message.user.id == USER_ID ? "You" : message.user.username
    }:</span>`;
        let part = ``;
        if (message.isInEdit) {
            part = `
<input id="edit-message-${message.id}" value="${message.content}" />
<button class="save-message-edit" onclick="endEdit(${message.id}, true)">[Save]</button>
<button class="cancel-message-edit" onclick="endEdit(${message.id}, false)">[Cancel]</button>`;
        } else {
            part = `
<span class="msg-content">${message.content}</span>
${
    message.user.id == USER_ID
        ? `<button class="edit-btn" 
    onclick="editMessage(${message.id})">[Edit]</button>
<button class="edit-btn" 
    onclick="deleteMessage(${message.id})">[Delete]</button>`
        : ""
} ${message.is_edited ? "(edited)" : ""}`;
        }

        return base + part + "</div>";
    },
    notification(title, content) {
        return `
<div>
    <p class="notification-title">${title}</p>
    <span>${content.substring(0, 50)}${content.length > 50 ? "..." : ""}</span>
</div>`;
    },
};

const Render = {
    messages(msgs) {
        const msgList = $("#msg_list");
        let html = "";
        for (const msg of msgs) {
            html += Templates.message(msg);
        }
        msgList.html(html);
        msgList.scrollTop(msgList[0].scrollHeight);
    },
};

const Notifications = {
    newMessage(msg) {
        const notifications = $("#notifications");
        const elem = document.createElement("div");
        elem.className = "notification";
        elem.innerHTML = Templates.notification(msg.user.username, msg.content);
        notifications.append(elem);
        setTimeout(() => {
            console.log(elem);
            $(elem).remove();
            console.log("removed!");
        }, 2000);
    },
};

function endEdit(messageId, save = false) {
    console.log("Ending edit", messageId, "save =", save);
    if (!save) return;
    const newContent = $("#edit-message-" + messageId).val();
    EDITING_MESSAGE.isInEdit = false;
    EDITING_MESSAGE.content = newContent + " (unsaved)";
    Render.messages(CHAT_MESSAGES[CURRENT_CHAT.id + ""]);
    EDITING_MESSAGE.content = newContent;
    Connection.send({
        type: "message_edit",
        data: EDITING_MESSAGE,
    });
}

function editMessage(id) {
    console.log("Editing", id);
    if (EDITING_MESSAGE) {
        EDITING_MESSAGE.isInEdit = false;
    }
    if (CURRENT_CHAT) {
        EDITING_MESSAGE = CHAT_MESSAGES[CURRENT_CHAT.id + ""].filter(
            (m) => m.id == id
        )[0];
        EDITING_MESSAGE.isInEdit = true;
        Render.messages(CHAT_MESSAGES[CURRENT_CHAT.id + ""]);
    }
}

function deleteMessage(id) {
    console.log("Deleting", id);
    if (CURRENT_CHAT) {
        const messageToDelete = CHAT_MESSAGES[CURRENT_CHAT.id + ""].filter(
            (m) => m.id == id
        )[0];
        messageToDelete.content = messageToDelete.content + " (deleting)";
        Render.messages(CHAT_MESSAGES[CURRENT_CHAT.id + ""]);
        Connection.send({
            type: "message_delete",
            data: {
                id: messageToDelete.id,
            },
        });
    }
}

const addChatMessage = (msg) => {
    const chatId = msg.chat.id;
    if (chatId + "" in CHAT_MESSAGES) {
        CHAT_MESSAGES[chatId + ""].push(msg);
    }
    if (CURRENT_CHAT != null && CURRENT_CHAT.id == chatId) {
        Render.messages(CHAT_MESSAGES[chatId + ""]);
    } else {
        Notifications.newMessage(msg);
    }
};

const editChatMessage = (msg) => {
    const chatId = msg.chat.id;
    if (chatId + "" in CHAT_MESSAGES) {
        const old = CHAT_MESSAGES[chatId + ""].filter(
            (m) => m.id === msg.id
        )[0];
        const index = CHAT_MESSAGES[chatId + ""].indexOf(old);
        if (index > -1) {
            CHAT_MESSAGES[chatId + ""][index] = msg;
        }
    }
    if (CURRENT_CHAT != null && CURRENT_CHAT.id == chatId) {
        Render.messages(CHAT_MESSAGES[chatId + ""]);
    } else {
        Notifications.newMessage(msg);
    }
};

const deleteChatMessage = (data) => {
    const id = data.id;
    const chatId = data.chat.id;
    if (chatId + "" in CHAT_MESSAGES) {
        const messages = (CHAT_MESSAGES[chatId + ""] = CHAT_MESSAGES[
            chatId + ""
        ].filter((m) => m.id != id));
        Render.messages(messages);
    }
};

const onConnected = async () => {
    const chats = await Requests.chatList();
    console.log(chats);
    $("#chat-list").html("");
    for (const chat of chats) {
        $("#chat_list").append(Templates.chatElement(chat));
    }
    $("div.chat-element").on("click", (e) => {
        let id = $(e.target).attr("chat-id");
        !id && (id = $(e.target).parent().attr("chat-id"));
        console.log("Click on chat", id);
        const msgList = $("#msg_list");
        msgList.empty();
        if (!id) return;
        CURRENT_CHAT = [...CHATS].filter((c) => c.id == id)[0];
        (id in CHAT_MESSAGES
            ? (async () => CHAT_MESSAGES[id])()
            : Requests.messages(id)
        ).then(Render.messages);
    });
};

const Connection = {
    connect(token) {
        const ws = new WebSocket(BASE_WS + "chat?token=" + token);
        this.ws = ws;
        ws.onopen = (ev) => {
            console.log("Open,", ev);
            status_element.innerText = "Connected!";
            onConnected();
        };
        ws.onclose = (ev) => {
            console.log("Close,", ev);
            status_element.innerText = "Closed!";
        };
        ws.onerror = (ev) => {
            console.log("Error,", ev);
            status_element.innerText = "Error!";
        };
        ws.onmessage = (ev) => {
            console.log("Msg,", ev);
            const data = JSON.parse(ev.data);
            if (data.type === "message") {
                const msg = data.data;
                console.log("raw msg", msg);
                addChatMessage(msg);
            } else if (data.type === "message_edit") {
                const newMsg = data.data;
                console.log("Message to edit", newMsg);
                editChatMessage(newMsg);
            } else if (data.type === "message_delete") {
                const msgData = data.data;
                console.log("Message to delete", msgData);
                deleteChatMessage(msgData);
            }
        };
    },
    send(obj) {
        this.ws.send(JSON.stringify(obj));
        console.log("sent", obj);
    },
    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    },
};

jQuery(($) => {
    $("#login-form").on("submit", (e) => {
        console.log("Submit ");
        e.preventDefault();
        const data = new FormData(e.target);
        Requests.token(data.get("username"), data.get("password"))
            .then(Requests.me)
            .then((user) => {
                user && $("#status_element").text("Success login!");
            })
            .then(() => {
                Connection.connect(TOKEN);
            });
    });
    $("#message-send-form").on("submit", (e) => {
        e.preventDefault();
        if (!CURRENT_CHAT) {
            alert("Select chat first!");
            return;
        }
        Connection.send({
            type: "message",
            data: {
                user_id: USER_ID,
                chat_id: CURRENT_CHAT.id,
                content: $("#msg").val(),
            },
        });
        $("#msg").val("");
    });
});
