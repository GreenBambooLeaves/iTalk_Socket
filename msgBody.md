- client
```js
// 聊天消息
message = {
    "charRoomID": charRoomId,
    "user":ID,
    "msg": msg
}

// 加入聊天室
toChat = {
    "charRoomID": charRoomID
}

// 创建聊天室
createChat = {
    "chatRoomName": name,
    "charRoomRemark": remark
}

// 退出聊天室
quitChat = {
    "ChartRoomID": charRoomID
}

// 登录
logIn = {
    "userName": name
}

// 退出
logOut = {
    "userID": ID
}
```

- server
```js
// 传递消息
chat = {
    "msg": msg
}

// 用户登录
logInOK = {
    "userID": ID,
    "chatRooms": charRooms
}

// 用户退出聊天室
quitChatOK = {
    "chatRooms": charRooms
}

// 用户加入或创建成功
toChatOK = {
    "chatRoom" :
    charRoom
}

serverError = {
    "msg": msg
}

```
