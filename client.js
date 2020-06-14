// 服务器地址
const PORT = '52433';
const HOST = '127.0.0.1';

// 输入输出流对象
const cout = process.stdout;
const cin = process.stdin;

// 消息包相关常量
const headerLen = 6;
const lenOffset = 2;

// 心跳标识
const timeTolive = 3;

// 客户端方法
const LogIn = Buffer.from([0, 1]);
const LogOut = Buffer.from([0, 0]);
const JoinChat = Buffer.from([1, 0]);
const CreateChat = Buffer.from([1, 1]);
const QuitChat = Buffer.from([1, 2]);
const Chat = Buffer.from([1, 3]);

// 服务器消息 
const serverLogInOK = Buffer.from([0, 1]);
const serverJoinChatOK = Buffer.from([0, 2]);
const serverCreateChatOK = Buffer.from([0, 3]);
const serverQuitChatOK = Buffer.from([0, 4]);
const serverLogInError = Buffer.from([1, 1]);
const serverJoinChatError = Buffer.from([1, 2]);
const serverCreateChatError = Buffer.from([1, 3]);
const serverChat = Buffer.from([1, 0]);

// 心跳消息
const heartBeat = Buffer.from([2, 0]);

const net = require('net');

// 用户状态初始化
let userID = -1;
let chatRoomID = -1;
let state = 'unconnection';
let name = '';
let client = null;

cout.write('请输入昵称：');
// 输入流处理输入
cin.on('data', (cinData) => {
    input = cinData.toString();
    if (input != '\r\n') {
        input = input.replace(/[\r\n]/ig, "");
        if (state == 'unconnection') {
            connection();
            state = 'login';
        }
        if (state == 'login') {
            name = input;
            state = 'joinorcreate';
            login();
        } else if (input.toLowerCase() == 'logout' && state !== 'chat') {
            logOut();
        } else if (state == 'joinorcreate') {
            if (input == 'join') {
                state = 'join';
                cout.write('请输入聊天室ID：');
            } else if (input == 'create') {
                state = 'create';
                cout.write('请输入聊天室名：');
            } else {
                cout.write('输入无效，请重新输入命令：');
            }
        } else if (state == 'join') {
            if (isNaN(input)) {
                cout.write('聊天室ID为数字序列，请重试：');
            } else {
                chatRoomID = Number(input);
                state = 'chat';
                joinTalk();
            }
        } else if (state == 'create') {
            name = input;
            state = 'remark';
            cout.write('请输入聊天室备注：');
        } else if (state == 'remark') {
            remark = input;
            state = 'chat';
            createTalk();
        } else if (state == 'chat') {
            msg = input;
            if (msg.toLowerCase() == 'exit' || msg.toLowerCase() == 'quit') {
                quitChat();
            } else {
                cout.write('你说：' + msg + '\r\n');
                chat();
                cout.write('输入聊天内容：');
            }
        }
    }
})

function addListener(client) {
    // 心跳机制
    client.serverLive = timeTolive;
    let isServerAlive = setInterval(() => {
        if (client.serverLive <= 0) {
            console.log('应用无响应，请稍后再试');
            client.destroy();
            process.exit();
        } else {
            let newBody = {};
            let message = generatePkg(heartBeat, newBody);
            client.write(message);
            client.serverLive -= 1;
        }
    }, 2000);
    client.on('connect', () => {
        cout.write('连接到服务器\r\n');
    })
    client.on('end', () => {
        console.log('client disconnected.\r\n');
    })
    client.on('error', () => {
        console.error();
    })
    // TCP拆包
    client.lastPkg = null;
    client.on('data', (message) => {
        // 上次未处理完的包
        let lastPkg = client.lastPkg;
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
            let serverMessage = Buffer.allocUnsafe(packlen);
            lastPkg.copy(serverMessage, 0, offset, offset + packlen);
            handlingServerMessage(serverMessage);
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
            client.lastPkg = buf;
        }
    })

}

// 读取TCP包的长度
function readPkgSize(packet, offset) {
    if (offset > (packet.length - headerLen)) {
        return -1;
    }

    let length = packet.readUInt32LE(offset);
    return length;
}

// 生成消息体
function generatePkg(method, messageBody) {
    let header = Buffer.allocUnsafe(headerLen);
    method.copy(header, 0, 0, lenOffset);
    let message = JSON.stringify(messageBody);
    let body = Buffer.from(message);
    header.writeInt32LE(body.byteLength + headerLen, lenOffset);
    let buf = Buffer.concat([header, body]);
    return buf;
}

// 连接到服务器
function connection() {
    client = new net.Socket();
    client.connect(PORT, HOST);
    addListener(client);
}

// 处理服务器消息
function handlingServerMessage(message) {
    let packetLen = message.byteLength;
    let method = Buffer.allocUnsafe(lenOffset);
    message.copy(method, 0, 0, lenOffset);
    let bodyBuf = Buffer.allocUnsafe(packetLen - headerLen);
    message.copy(bodyBuf, 0, headerLen);
    let body = JSON.parse(bodyBuf.toString().replace(/\n/g, "\\n").replace(/\r/g, "\\r"));
    if (method.equals(serverLogInOK)) {
        cout.write('登陆成功\r\n');
        cout.write('输入join加入聊天室，输入create创建聊天室，输入logout退出应用\r\n');
        userID = body.userID;
        if (body.chatRooms.length === 0) {
            cout.write('目前没有聊天室存在，你可以自己创建\r\n');
        } else {
            cout.write('以下是现存的聊天室信息\r\n');
            for (let i = 0; i < body.chatRooms.length; i++) {
                cout.write('聊天室ID：' + body.chatRooms[i].ID + ' 聊天室名：' + body.chatRooms[i].name + ' 聊天室备注：' + body.chatRooms[i].remark + ' 聊天室人数：' + body.chatRooms[i].num + '\r\n');
            }
        }
        cout.write('请输入命令：');
    } else if (method.equals(serverJoinChatOK)) {
        cout.write('加入聊天室成功\r\n');
        cout.write('输入exit或quit可以退出当前聊天室\r\n');
        let room = '聊天室ID：' + body.chatRoom.ID + ' 聊天室名：' + body.chatRoom.name + ' 聊天室备注：' + body.chatRoom.remark + ' 聊天室人数：' + body.chatRoom.num + '\r\n';
        cout.write(room);
        cout.write('输入聊天内容：');
    } else if (method.equals(serverJoinChatError)) {
        if (body.chatRooms.length === 0) {
            cout.write('目前没有聊天室存在，你可以自己创建\r\n');
            cout.write('输入join加入聊天室，输入createt创建聊天室，输入logout退出应用\r\n');
            cout.write('请输入命令：');
            state = 'joinorcreate';
        } else {
            cout.write("聊天室不存在，请重新输入聊天室ID：");
            chatRoomID = -1;
            state = 'join';
        }
    } else if (method.equals(serverCreateChatOK)) {
        cout.write('创建聊天室成功\r\n');
        cout.write('输入exit或quit可以退出当前聊天室\r\n');
        let room = '聊天室ID：' + body.chatRoom.ID + ' 聊天室名：' + body.chatRoom.name + ' 聊天室备注：' + body.chatRoom.remark + ' 聊天室人数：' + body.chatRoom.num + '\r\n';
        cout.write(room);
        cout.write('输入聊天内容：');
        chatRoomID = body.chatRoom.ID;
    } else if (method.equals(serverCreateChatError)) {
        cout.write("您创建的聊天室名称已存在，请重试！\r\n");
        state = 'create';
    } else if (method.equals(serverQuitChatOK)) {
        cout.write('您已退出聊天室\r\n');
        if (body.chatRooms.length === 0) {
            cout.write('目前没有聊天室存在，你可以自己创建\r\n');
            cout.write('输入join加入聊天室，输入createt创建聊天室，输入logout退出应用\r\n');
            cout.write('请输入命令：');
            state = 'joinorcreate';
        } else {
            for (let i = 0; i < body.chatRooms.length; i++) {
                cout.write('以下是现存的聊天室信息\r\n');
                cout.write('聊天室ID：' + body.chatRooms[i].ID + ' 聊天室名：' + body.chatRooms[i].name + ' 聊天室备注：' + body.chatRooms[i].remark + ' 聊天室人数：' + body.chatRooms[i].num + '\r\n');
                cout.write('输入join加入聊天室，输入createt创建聊天室，输入logout退出应用\r\n');
                cout.write('请输入命令：');
                state = 'joinorcreate';
            }
        }
    } else if (method.equals(serverLogInError)) {
        cout.write("该昵称已存在，请重试：");
        state = 'login';
    } else if (method.equals(serverChat)) {
        let msg = body.msg + '\r\n';
        cout.write(msg);
        cout.write('输入聊天内容：');
    } else if (method.equals(heartBeat)) {
        client.serverLive = timeTolive;
    }
}

// 聊天
function chat() {
    newBody = {
        chatRoomID: chatRoomID,
        user: userID,
        msg: msg
    }
    message = generatePkg(Chat, newBody);
    client.write(message);
}
// 登录
function login() {
    newBody = {
        userName: name
    }
    message = generatePkg(LogIn, newBody);
    client.write(message);
}

// 加入聊天室
function joinTalk() {
    newBody = {
        userID: userID,
        chatRoomID: chatRoomID
    }
    message = generatePkg(JoinChat, newBody);
    client.write(message);
}

// 创建聊天室
function createTalk() {
    newBody = {
        userID: userID,
        chatRoomName: name,
        chatRoomRemark: remark
    }
    message = generatePkg(CreateChat, newBody);
    client.write(message);
}

// 退出聊天室
function quitChat() {
    newBody = {
        userID: userID,
        chatRoomID: chatRoomID
    }
    message = generatePkg(QuitChat, newBody);
    client.write(message);
    chatRoomID = -1;
    state = 'joinorcreate';
}

// 退出应用
function logOut() {
    newBody = {
        userID: userID
    }
    message = generatePkg(LogOut, newBody);
    client.write(message);
    client.end();
    client.destroy();
    cout.write('您已退出应用，再见！');
    process.exit();
    return;
}