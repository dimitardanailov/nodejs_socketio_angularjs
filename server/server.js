var path = require('path')
    , fs = require('fs')
    , http = require('http')
    , connect = require('connect')
    , express = require('express')
    , socketIO = require('socket.io')
    , bodyParser = require('body-parser');

// ========================
// Database
// ========================

// ========================
// Database
// ========================


// ========================
// Server
// ========================
var app = express();

// Set Hostname
app.set('hostname', process.env.OPENSHIFT_NODEJS_IP || 'localhost');

// Set Port
app.set('port', process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 9000);

// The route base is ../app
app.set('views', path.resolve(__dirname, '../app'));

// Render html by just spitting the file out
app.set('view engine', 'html');
app.engine('html', function (path, options, fn) {
  if ('function' == typeof options) {
    fn = options, options = {};
  }
  fs.readFile(path, 'utf8', fn);
});

app.use(bodyParser());

// Serve the app folder statically
app.use(express.static(path.resolve(__dirname, '../app')));
// ========================
// Server
// ========================

// ========================
// API
// ========================
app
  // Get information by Chat room :id
  .get('/api/chatroom/:id', function(request, response, next) {
    // Get Chat Room Information
    var chatRoomId = request.params.id;
    var chatRoom = new Object();
    chatRoom.id = chatRoomId;
    chatRoom.name = 'Nodejs Chat Room';

    // Get Chat Room Users
    var users = new Array();
    var min = 100;
    var max = 105;
    for (i = min; i <= max; i++) {
      var user = new Object();
      user.id = i;
      user.chatRoomUsername = 'username ' + i;
      users.push(user);
    }

    // Get Chat Room Messages
    var messages = new Array();
    for (i = 1; i < 10; i++) {
      var message = new Object();
      message.id = i;
      message.text = 'text ' + i;
      message.created_at = new Date();

      var userId = Math.floor(Math.random()*(max-min+1)+min);
      message.username = 'username ' + userId;

      messages.push(message);
    }

    var jsonResponse = new Object();
    jsonResponse.chatRoom = chatRoom
    jsonResponse.messages = messages;
    jsonResponse.users = users;

    // Generate Json
    var jsonObject = JSON.stringify(jsonResponse);

    response.send(jsonObject);
  }) // End get(/api/chatroom/:id

  // Create a new chat message
  .post('/api/message', function(request, response, next) {
    var message = new Object();
    message = request.body;
    message.created_at = new Date();

    // Generate Json
    var jsonObject = JSON.stringify(message);

    response.send(jsonObject);
  })

  // Add a User to Chat Room
  .post('/api/chatroomuser', function(request, response, next) {
    var requestType = typeof(request.body)

    if (requestType === 'object') {
      var chatRoomUser = new Object(request.body);
      // Push ChatRoomUser to database

      // Get Chat Room User information
      var user = new Object();
      user.id = chatRoomUser.user_id;
      user.chatRoomUsername = 'username ' + user.id;

      // Generate Json
      var jsonObject = JSON.stringify(user);

      response.send(jsonObject);
    } else {
    }
  });
// ========================
// API
// ========================

// Point all requests at one file
app.get('*', function (req, res) {
  res.render('index.html', { layout: null });
});

// Create a new http server
var port = app.get('port');
var hostname = app.get('hostname');
var server = http.createServer(app);
server.listen(port, function() {
  console.log("Server listening on port %d", port);
});
  
// ========================
// SOCKET IO
// ========================

// Initialize a new socket.io object. It is bound to 
// the express app, which allows them to coexist.
var io = socketIO.listen(server, { log: false });

// Initialize a new socket.io application, named 'chat'
var chatRoomNameSpace = '/chat';

var chat = io.of(chatRoomNameSpace).on('connection', function(socket) {

  socket.nameSpace = chatRoomNameSpace;

  console.log('info  - socket.io started');

  // Every room has standart prefix. To generate unique chat room we use database
  // chat room id
  var chatRoomStandartName = 'room';

  // When then client emits 'add user to chat room', save his username and userId and 
  // add them to the room
  socket.on('user:join', function(data) {
    var user = data.user;

    // Initialize socket information
    // Store User information { id: 1, chatRoomUsername: 'username 101' }
    socket.user = user;

    // Store Chat Room information { id: '7', name: 'Nodejs Chat Room' }
    var chatRoom = data.chatRoom;
    socket.chatRoom = chatRoom;

    // Get Chat Room Id
    var chatRoomId = chatRoom.id;
    console.log("Chat room ID %d", chatRoomId);
    console.log("Chat Room user", user);

    // Generate Chat Room Name
    socket.roomName = chatRoomStandartName + chatRoomId;

    console.log('Chat room: %s', socket.roomName);

    // Add the client to the room
    socket.join(socket.roomName);

    // Get all active rooms
    // console.log(io.sockets.manager.rooms);

    // Debug Clients Room information
    //var clients = io.of(socket.nameSpace).clients(socket.roomName);

    // When the client open chat room get information how many users use this chat room
    var chatRoomUsers = io.of(socket.nameSpace).clients(socket.roomName).length;

    // Send the 'add user' event to all the people in the
    // room, along with a list of people that are in it.
    chat.in(socket.roomName).emit('user:join',  {
      id: chatRoomId, 
      user: data.user,
      chatRoomUsers: chatRoomUsers
    });
  });


  // When user typing or stop typing message emit response to other users into this room
  var typingHandler = function(typingEvent) {
    socket.on(typingEvent, function() {
      // Get Chat Room
      var chatRoom = socket.roomName;
    
      // Get typing user information
      var user = socket.user;
      
      // send to all clients in 'room' room except sender
      socket.broadcast.to(chatRoom).emit(typingEvent, {
        user: user
      });
    });
  }

  typingHandler('user:typing');
  typingHandler('user:stop_typing');

  // Handle the sending of messages
  // When the server receives a message, it sends it to the other person in the room.
  socket.on('message:created', function(messageData) {
    var message = messageData.message;

    // Get Chat Room
    var chatRoom = socket.roomName;

    console.log('Chat room %s has a new message', chatRoom);

    // send to all clients in 'room' room except sender
    socket.broadcast.to(chatRoom).emit('room:new_message', {
      message: message
    });
  });

  // Somebody left the chat and
  // Notify the other users in the chat room that his partner has left
  socket.on('disconnect', function() {
    
    // Check socket information
    if (socket.hasOwnProperty('chatRoom')) {
      // Get Chat Room
      var chatRoom = socket.roomName;

      // leave the room
      socket.leave(chatRoom);
      
      // When the client open chat room get information how many users use this chat room
      var chatRoomUsers = io.of(socket.nameSpace).clients(chatRoom).length;

      // Emit to other users - user was quit into chat room
      socket.broadcast.to(chatRoom).emit('user:left', {
        chatRoom: this.chatRoom,
        user: this.user,
        chatRoomUsers: chatRoomUsers
      });
    }
  });
});
