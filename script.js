BASE_URL = "localhost:8000";
BASE_HTTP = "http://" + BASE_URL + "/api/";
BASE_WS = "ws://" + BASE_URL + "/ws/";

CHATS = [];
CURRENT_CHAT = null;
CHAT_MESSAGES = {};
TOKEN = null;
USER_ID = 0;
USER = null;
EDITING_MESSAGE = null;
CHAT_CREATING = null;

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
    async chat(id) {
        const res = await Requests.tokenizedRequest("chat/" + id, {
            method: "GET",
        });
        if (!res.ok) {
            $("#status_element").text("Get chat: " + res.statusText);
            return null;
        }
        return await res.json();
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
    async search(query) {
        const res = await Requests.tokenizedRequest(
            "users/search?query=" + query,
            { method: "GET" }
        );
        if (!res.ok) return [];
        return await res.json();
    },
    async createDirectChat(userId) {
        if (CHAT_CREATING !== null) return null;
        CHAT_CREATING = userId;
        const res = await Requests.tokenizedRequest("chat/", {
            method: "POST",
            body: JSON.stringify({
                type: "DIRECT",
                created_by: USER_ID,
                users: [USER_ID, userId],
            }),
        });
        if (!res.ok) return null;
        CHAT_CREATING = null;
        return await res.json();
    },
};

const Templates = {
    chatElement(chat) {
        return /*html*/ `
            <div class="chat-element" chat-id="${chat.id}">
                <span>${chat.name}</span>
            </div>`;
    },
    chatElementUser(user) {
        return /*html*/ `
            <div class="chat-element chat-element-user" user-id="${user.id}">
                <span>${
                    user.first_name +
                    (user.last_name ? " " + user.last_name : "")
                }</span>
            </div>`;
    },
    message(message) {
        const messageClass =
            "message" + message.user.id == USER_ID ? "-self" : "";
        const uName =
            message.user.id == USER_ID ? "You" : message.user.username;

        let part = ``;
        if (message.isInEdit) {
            part = /*html*/ `
                <input id="edit-message-${message.id}" value="${message.content}" />
                <button class="save-message-edit" onclick="endEdit(${message.id}, true)">[Save]</button>
                <button class="cancel-message-edit" onclick="endEdit(${message.id}, false)">[Cancel]</button>`;
        } else {
            const inner =
                message.user.id == USER_ID
                    ? /*html*/ `
                        <button class="edit-btn" onclick="editMessage(${message.id})">[Edit]</button>
                        <button class="edit-btn" onclick="deleteMessage(${message.id})">[Delete]</button>`
                    : "";
            part = /*html*/ `
                <span class="msg-content">${message.content}</span>
                ${inner}
                ${message.is_edited ? "(edited)" : ""}`;
        }

        return /*html*/ `
            <div class="${messageClass}" message-id="${message.id}">
                <span>${uName}:</span>
                ${part}
            </div>`;
    },
    notification(title, content) {
        return /*html*/ `
            <div>
                <p class="notification-title">${title}</p>
                <span>${content.substring(0, 50)}${
            content.length > 50 ? "..." : ""
        }</span>
            </div>`;
    },
};

class NewChat {
    constructor(user) {
        this.user = user;
    }
}

const Render = {
    messages(msgs, isNewChat = false) {
        const msgList = $("#msg_list");
        let html = "";
        for (const msg of msgs) {
            html += Templates.message(msg);
        }
        msgList.html(html);
        msgList.scrollTop(msgList[0].scrollHeight);
    },
    chats(chats, isSearch = false, searchUsers = []) {
        $("#chat_list").empty();
        if (isSearch) {
            for (const user of searchUsers) {
                $("#chat_list").append(Templates.chatElementUser(user));
            }
            $("div.chat-element-user").on("click", (e) => {
                let id = $(e.target).attr("user-id");
                !id && (id = $(e.target).parent().attr("user-id"));
                console.log("Click on user", id);
                const msgList = $("#msg_list");
                msgList.empty();
                if (!id) return;
                CURRENT_CHAT = new NewChat(+id);
                console.log(CURRENT_CHAT);
                Render.messages([], true);
            });
        } else {
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
        }
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

function changeApiUrl(url) {
    BASE_URL = url;
    BASE_HTTP = "http://" + BASE_URL + "/api/";
    BASE_WS = "ws://" + BASE_URL + "/ws/";
}

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
    } else if (CHATS.filter((c) => c.id == msg.chat.id).length == 0) {
        CHATS = [msg.chat, ...CHATS];
        Requests.chat(msg.chat.id).then((res) => {
            if (res) {
                console.log("fetched chat", res);
                const index = CHATS.indexOf(msg.chat);
                console.log("chat from message", msg.chat, "index", index);
                CHATS[index] = res;
                if ($("#search").val().length < 3) Render.chats(CHATS);
            }
        });
        CHAT_MESSAGES[chatId + ""] = [msg];
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
    Render.chats(chats);
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
    disconnect() {
        this.ws.close();
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
    $("#api_url").on("change", (e) => {
        changeApiUrl($("#api_url").val());
    });
    $("#search").on("input", function () {
        window.SEARCH_QUERY = $(this).val();
        if (window.SEARCH_QUERY.length >= 3) {
            Requests.search(window.SEARCH_QUERY).then((users) =>
                Render.chats([], true, users)
            );
        } else {
            Render.chats(CHATS);
        }
    });
    $("#disconnect_btn").on("click", (_) => Connection.disconnect());
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
        if (CURRENT_CHAT instanceof NewChat) {
            const msg = $("#msg").val();
            Requests.createDirectChat(CURRENT_CHAT.user)
                .then((res) => res && (CURRENT_CHAT = res))
                .then((res) => {
                    if (res) {
                        Connection.send({
                            type: "message",
                            data: {
                                user_id: USER_ID,
                                chat_id: CURRENT_CHAT.id,
                                content: msg,
                            },
                        });
                    }
                });
        } else {
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
        }
        $("#msg").val("");
    });
});
