let net = require('net');

let server = net.createServer();

// 聊天室类
class chatRoom {
    constructor(ID, name, remark) {
        this.ID = ID;
        this.name = name;
        this.remark = remark;
        this.num = 1;
    }
}

// 用户类
class user {
    constructor(ID, name, chatRoomID, socket) {
        this.ID = ID;
        this.name = name;
        this.chatRoomID = chatRoomID;
        this.socket = socket;
    }
}

// 聊天室与用户列表
let chatRooms = [];
let users = [];

// 消息头长度标识
const headerLen = 6;
const lenOffset = 2;

// 未加入聊天室用户的chatRoomID
const notInChat = -1;

const notLogIn = -1;

// 服务端的消息头标识
const serverLogInOK = Buffer.from([0, 1]);
const serverJoinChatOK = Buffer.from([0, 2]);
const serverCreateChatOK = Buffer.from([0, 3]);
const serverQuitChatOK = Buffer.from([0, 4]);
const serverLogInError = Buffer.from([1, 1]);
const serverJoinChatError = Buffer.from([1, 2]);
const serverCreateChatError = Buffer.from([1, 3]);
const serverChat = Buffer.from([1, 0]);

// 客户端消息头标识
const clientLogIn = Buffer.from([0, 1]);
const clientLogOut = Buffer.from([0, 0]);
const clientJoinChat = Buffer.from([1, 0]);
const clientCreateChat = Buffer.from([1, 1]);
const clientQuitChat = Buffer.from([1, 2]);
const clientChat = Buffer.from([1, 3]);

// client的生存期，收到心跳包会重置。
const timeTolive = 3;
const heartBeat = Buffer.from([2, 0]);

server.on('connection', (socket) => {

    socket.userID = notLogIn;
    socket.liveTime = timeTolive;
    let aliveTimer = setInterval(() => {
        if (socket.liveTime <= 0) {
            deleteUser(socket.userID);
            socket.destroy();
        } else {
            socket.liveTime -= 1;
        }
    }, 2000)

    socket.on('end', () => {
        console.log('client disconnected.');
        socket.destroy();
    })
    socket.on('error', () => {
        console.error();
    })

    // TCP拆包
    socket.lastPkg = null;
    socket.on('data', (message) => {
        // 上次未处理完的包
        let lastPkg = socket.lastPkg;
        console.log("last");
        console.log(lastPkg);
        console.log("this");
        if (lastPkg != null) {
            let nowBuf = Buffer.concat([lastPkg, message], lastPkg.length + message.length);
            lastPkg = nowBuf;
        } else {
            lastPkg = message;
        }

        let offset = 0;
        let packlen = readPkgSize(lastPkg, offset + lenOffset);
        if (packlen < 0) {
            return;
        }

        // 条件成立时至少读到了一个完整包
        while (offset + packlen <= lastPkg.length) {
            let clientMessage = Buffer.allocUnsafe(packlen);
            lastPkg.copy(clientMessage, 0, offset, offset + packlen);
            handleClientMessage(socket, clientMessage);
            console.log(clientMessage);
            offset += packlen;
            // 当前TCP包处理完
            if (offset >= lastPkg.length) {
                break;
            }

            packlen = readPkgSize(lastPkg, offset + lenOffset);
            if (packlen < 0) {
                break;
            }
        }

        // 完整的消息包处理完成，处理剩下的未完整消息
        if (offset >= lastPkg.length) {
            lastPkg = null;
        } else {
            let buf = Buffer.allocUnsafe(lastPkg.length - offset);
            lastPkg.copy(buf, 0, offset, lastPkg.length);
            socket.lastPkg = buf;
        }
    })
})

// 服务器开始监听
server.listen(52433, function () {
    console.log('iTalk startrd!');
})

// 处理客户端消息
function handleClientMessage(socket, message) {
    let packetLen = message.length;
    let method = Buffer.allocUnsafe(lenOffset);
    message.copy(method, 0, 0, lenOffset);
    let bodyBuf = Buffer.allocUnsafe(packetLen - headerLen);
    message.copy(bodyBuf, 0, headerLen);
    let body = JSON.parse(bodyBuf.toString().replace(/\n/g, "\\n").replace(/\r/g, "\\r"));

    // 根据消息头标识调用相应的方法
    console.log(body);
    console.log(method);
    if (method.equals(clientLogIn)) {
        console.log("beforelogin");
        logIn(socket, body);
        console.log("arterlogin");
    } else if (method.equals(clientLogOut)) {
        logOut(socket, body);
        console.log("logout");
    } else if (method.equals(clientCreateChat)) {
        createChat(socket, body);
        console.log("create");
    } else if (method.equals(clientJoinChat)) {
        joinChat(socket, body);
        console.log("join");
    } else if (method.equals(clientQuitChat)) {
        quitChat(socket, body);
        console.log("quit");
    } else if (method.equals(clientChat)) {
        passMessage(socket, body);
        console.log("chat");
    } else if (method.equals(heartBeat)) {
        heatBeat(socket, body);
    }

}

// 读取整个消息的长度
function readPkgSize(packet, offset) {
    if (offset > (packet.length - headerLen)) {
        return -1;
    }

    let length = packet.readUInt32LE(offset);
    return length;
}

// 产生一个完整的消息
function generatePkg(method, messageBody) {
    let header = Buffer.allocUnsafe(headerLen);
    method.copy(header, 0, 0, lenOffset);
    let message = JSON.stringify(messageBody);
    let body = Buffer.from(message);
    header.writeInt32LE(body.byteLength + headerLen, lenOffset);
    let buf = Buffer.concat([header, body]);
    return buf;
}

// 处理登录
function logIn(socket, body) {
    let userNum = users.length;
    for (let i = 0; i < userNum; i++) {
        // 用户名重复，发生错误
        if (body.userName === users[i].name) {
            let newBody = {};
            let message = generatePkg(serverLogInError, newBody)
            socket.write(message);
            return;
        }
    }

    // 生成用户ID
    let userID;
    if (userNum === 0) {
        userID = 0;
    } else {
        userID = users[userNum - 1].ID + 1;
    }
    socket.userID = userID;
    let newUser = new user(userID, body.userName, notInChat, socket);
    users.push(newUser);
    let newBody = {
        userID: userID,
        chatRooms: chatRooms
    };
    console.log(newBody);
    let message = generatePkg(serverLogInOK, newBody);
    socket.write(message);
    console.log(users);
}

// 处理退出
function logOut(socket, body) {
    let userNum = users.length;
    for (let i = 0; i < userNum; i++) {
        if (body.userID === users[i].ID) {
            users.splice(i, 1);
            break;
        }
    }
    socket.end();
}

// 加入聊天室
function joinChat(socket, body) {
    let userID = body.userID;
    let chatRoomID = body.chatRoomID;
    let userNum = users.length;
    let isChatExist = false;
    let chatRoom;
    let userName;

    // 检查聊天室是否存在
    chatNum = chatRooms.length;
    for (let i = 0; i < chatNum; i++) {
        if (chatRoomID === chatRooms[i].ID) {
            chatRooms[i].num += 1;
            chatRoom = chatRooms[i];
            isChatExist = true;
            break;
        }
    }

    // 加入聊天室获取用户名
    if (isChatExist) {
        for (let i = 0; i < userNum; i++) {
            if (userID === users[i].ID) {
                users[i].chatRoomID = chatRoomID;
                userName = users[i].name;
                break;
            }
        }
    }

    // 加入聊天室成功
    if (isChatExist) {
        let newBody = {
            chatRoom: chatRoom
        }
        let message = generatePkg(serverJoinChatOK, newBody);
        socket.write(message);

        // 通知聊天室的其他人
        let msg = '\r\n' + userName + "加入了聊天室";
        newBody = {
            msg: msg
        }
        message = generatePkg(serverChat, newBody);
        for (let i = 0; i < userNum; i++) {
            if (userID !== users[i].ID && chatRoomID === users[i].chatRoomID) {
                users[i].socket.write(message);
            }
        }
        return;
    } else {
        // 聊天室不存在，发生错误
        let newBody = {
            chatRooms: chatRooms
        };
        let message = generatePkg(serverJoinChatError, newBody);
        socket.write(message);
        return;
    }
}

// 创建聊天室
function createChat(socket, body) {
    let chatRoomName = body.chatRoomName;
    let chatRoomRemark = body.chatRoomRemark;
    let userID = body.userID;
    let chatRoomID;
    let chatNum = chatRooms.length;
    let isNameOnce = true;
    let newChat;

    // 检查聊天室是否重名
    for (let i = 0; i < chatNum; i++) {
        if (chatRoomName === chatRooms[i].name) {
            isNameOnce = false;
            break;
        }
    }

    // 生成聊天室ID
    if (isNameOnce) {
        if (chatNum === 0) {
            chatRoomID = 0;
        } else {
            chatRoomID = chatRooms[chatNum - 1].ID + 1;
        }
        newChat = new chatRoom(chatRoomID, chatRoomName, chatRoomRemark);
        chatRooms.push(newChat);

        for (let i = 0; i < users.length; i++) {
            if (users[i].ID === userID) {
                users[i].chatRoomID = chatRoomID;
                break;
            }
        }
    }

    // 发送创建成功或失败的消息
    if (isNameOnce) {
        let newBody = {
            chatRoom: newChat
        };
        let message = generatePkg(serverCreateChatOK, newBody);
        socket.write(message);
        return;
    } else {
        let newBody = {};
        let message = generatePkg(serverCreateChatError, newBody);
        socket.write(message);
        return;
    }
}

// 退出聊天室
function quitChat(socket, body) {
    let userID = body.userID;
    let chatRoomID = body.chatRoomID;
    let userNum = users.length;
    let chatNum = chatRooms.length;
    let userName;

    // 用户状态设置为不在聊天室中
    for (let i = 0; i < userNum; i++) {
        if (userID === users[i].ID) {
            users[i].chatRoomID = notInChat;
            userName = users[i].name;
            break;
        }
    }
    // 更新聊天室的用户数量，如果为零则删除聊天室
    for (let i = 0; i < chatNum; i++) {
        if (chatRoomID === chatRooms[i].ID) {
            chatRooms[i].num--;
            if (chatRooms[i].num === 0) {
                chatRooms.splice(i, 1);
                break;
            }
            break;
        }
    }

    // 传递现存聊天室信息
    let newBody = {
        chatRooms: chatRooms
    }
    let message = generatePkg(serverQuitChatOK, newBody);
    socket.write(message);

    // 向聊天室广播退出信息
    let msg = '\r\n' + userName + "退出了聊天室";
    newBody = {
        chatRoomID: chatRoomID,
        user: userID,
        msg: msg
    };
    message = generatePkg(serverChat, newBody);
    for (let i = 0; i < userNum; i++) {
        if (userID !== users[i].ID && chatRoomID === users[i].chatRoomID) {
            users[i].socket.write(message);
        }
    }
}

// 传递消息
function passMessage(socket, body) {
    let chatRoomID = body.chatRoomID;
    let userID = body.user;
    let msg = body.msg;
    let userNum = users.length;
    let userName;
    for (let i = 0; i < userNum; i++) {
        if (users[i].ID === userID) {
            userName = users[i].name;
        }
    }
    msg = '\r\n' + userName + '说：' + msg;
    let newBody = {
        msg: msg
    };
    for (let i = 0; i < userNum; i++) {
        if (users[i].ID !== userID && users[i].chatRoomID === chatRoomID) {
            let message = generatePkg(serverChat, newBody);
            users[i].socket.write(message);
            console.log('Pass ' + users[i].ID);
        }
    }
}

// 处理心跳
function heatBeat(socket) {
    socket.liveTime = timeTolive;
    let newBody = {};
    let message = generatePkg(heartBeat, newBody);
    socket.write(message);
}

// 用户异常退出
function deleteUser(userID) {
    if (userID === notLogIn) {
        return;
    }
    let userNum = users.length;
    let chatNum = chatRooms.length;
    let chatRoomID = notInChat;
    let userName;

    // 用户从聊天室和应用退出
    for (let i = 0; i < userNum; i++) {
        if (users[i].ID === userID) {
            if (users[i].chatRoomID !== notInChat) {
                chatRoomID = users[i].chatRoomID;
                userName = users[i].name;
            }
            users.splice(i, 1);
            userNum -= 1;
            break;
        }
    }

    // 用户从聊天室退出
    if (chatRoomID !== notInChat) {
        for (let i = 0; i < chatNum; i++) {
            chatRooms[i].num--;
            if (chatRooms[i].num === 0) {
                chatRooms.splice(i, 1);
                break;
            }
            break;
        }

        // 广播用户退出消息
        let msg = '\r\n' + userName + "退出了聊天室";
        newBody = {
            chatRoomID: chatRoomID,
            user: userID,
            msg: msg
        }
        message = generatePkg(serverChat, newBody);
        for (let i = 0; i < userNum; i++) {
            if (userID !== users[i].ID && chatRoomID === users[i].chatRoomID) {
                users[i].socket.write(message);
            }
        }
    }
}