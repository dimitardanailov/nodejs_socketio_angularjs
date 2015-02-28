// Configuration with required angular modules
var angularModules = [
  'ngResource',
  'ngRoute'
];

// Make Base Configuration
var ChatSystem = angular.module("ngChatSystem", angularModules);

// Routes
//
// $routeProvider - Used for configuring routes.
//
// $locationProvider - Use the $locationProvider to configure how the 
// application deep linking paths are stored.
ChatSystem.config(function ($routeProvider, $locationProvider) {
  // Configure the routes
  $routeProvider
    .when('/chatroom/:chatRoomId/:userId', {
      controller: 'chatRoom',
      templateUrl: 'chatRoom.html'
    });
  
  // use the HTML5 History API
  $locationProvider.html5Mode(true);
});
// End Angularjs Routes

// FACTORIES

// Factory to Sending Message to Database
// Factory for ChatRoom Model
ChatSystem.factory('ChatRoomFactory', function($resource) {
  var chatRoom = $resource('/api/chatroom/:id', { id: '@id' });

  return chatRoom;
});

// Factory for Message Model
ChatSystem.factory('MessageFactory', function($resource) {
  var message = $resource('/api/message/:id', { id: '@id' });

  return message;
});

// Factory for ChatRoom Model
ChatSystem.factory('ChatRoomUserFactory', function($resource) {
  var chatRoomUser = $resource('/api/chatroomuser/:userid', { userid: '@userid' });

  return chatRoomUser;
});
// END FACTORIES
  
// SERVICIES
ChatSystem.service('UserService', 
  ['$routeParams', 'IntegerService', 'ChatRoomUserFactory', 'SocketIOServiceChat',
  function($routeParams, IntegerService, ChatRoomUserFactory, SocketIOServiceChat) {

  // Try to get by user id active id from chat room users list 
  this.getActiveUser = function(scope) {
    var paramUserId = $routeParams.userId;
    var userId = IntegerService.castStringToInteger(paramUserId);

    if (userId !== null) {
      var user = new Object();
      user.id = userId;
      user.chatRoomUsername = null;

      // Check type of users response
      var type = typeof(scope.users);
      type = type.toLowerCase();
      if (type === 'object') {
        // Find user into list of users
        var users = scope.users;
        for (var iterator in users) {
          var tempUser = users[iterator];
          if (user.id === tempUser.id) {
            user.chatRoomUsername =  tempUser.chatRoomUsername;
            break;
          }
        }
      }

      // Asign to scope active user
      scope.user =  user;

      // Check Active user exist into database for this chat room
      if (user.chatRoomUsername === null) {
        // This user doesn't exist into this chat room.
        // And he/she must be added into database chat room information
        this.joinUserToChatRoom(userId, scope);
      } else {
        this.emitUserToChatRoom(scope);
      }

    } else {
      // Throw error user id is not a valid Integer
      alert('Please pass valid integer param');
    }
  } // END this.getActiveUser

  // Add user to chat room
  this.joinUserToChatRoom = function(userId, scope) {
    // Create a empty valid database chat room user object
    var chatRoomUser = new ChatRoomUserFactory({});
    chatRoomUser.chat_room_id = scope.chatRoom.id;
    chatRoomUser.user_id = userId;

    var $this = this;
    chatRoomUser.$save(function(responseUser) {
      if (typeof responseUser === 'object') {
        scope.users.push(responseUser);
        scope.user = responseUser;

        $this.emitUserToChatRoom(scope);
      }
    });
  } // END this.joinUserToChatRoom

  // emit server message
  this.emitUserToChatRoom = function(scope) {
    var chatRoomData = new Object();
    chatRoomData.user = new Object({
      id: scope.user.id,
      chatRoomUsername: scope.user.chatRoomUsername
    });
    chatRoomData.chatRoom = scope.chatRoom;

    // Send to server user and chat information
    SocketIOServiceChat.emit('user:join', chatRoomData);
  }
}]);

ChatSystem.service('MessageService', 
  ['MessageFactory', 'SocketIOServiceChat', function(MessageFactory, SocketIOServiceChat) {

  this.createDatabaseMessage = function(scope) {
    var message = scope.message;

    var textMessageIsvalid = message.hasOwnProperty('text') && message.text.length > 0;

    if (textMessageIsvalid) {
      // Create a empty valid database message object
      scope.dbMessage = new MessageFactory({});
      scope.dbMessage.user_id = scope.user.id;
      scope.dbMessage.username = scope.user.chatRoomUsername;
      scope.dbMessage.text = scope.message.text;

      // Send Post Request
      scope.dbMessage.$save(function(responseMessage) {
        // Reset textarea
        scope.message.text = null;

        // Append response message to existing list
        scope.messages.push(responseMessage);

        // tell server to execute 'create a message' and send along one parameter
        var messageData = Object();
        messageData.message = responseMessage;
        SocketIOServiceChat.emit('message:created', messageData);
      });
    } else {
      alert('Invalid data');
    }
  } // END this.createDatabaseMessage
}]);

ChatSystem.service('IntegerService', function() {
  this.castStringToInteger = function(stringParam) {
    var integerValue = parseInt(stringParam);
    if (isNaN(stringParam)) {
      integerValue = null;
    }

    return integerValue;
  } // END this.castStringToInteger
});

// Socket Events
ChatSystem.service('SocketIOServiceChat', ['$rootScope', function($rootScope) {

  var namespace = '/chat';
  // var socketChat = io.connect('http://localhost' + namespace);
  var socketChat = io.connect('https://simple-chat-socket-system.herokuapp.com' + namespace);

  console.log(socketChat);

  // Send socket request to server
  this.emit = function(eventName, data, callback) {
    socketChat.emit(eventName, data, function () {
      var args = arguments;
      $rootScope.$apply(function () {
        if (callback) {
          callback.apply(socket, args);
        }
      });
    });
  };

  // Server Response
  this.on = function(eventName, callback) {
    socketChat.on(eventName, function () {  
      var args = arguments;
      $rootScope.$apply(function () {
        callback.apply(socketChat, args);
      });
    });
  };

}]);
// SERVICIES

// CONTROLLERS
ChatSystem.controller("chatRoom", function($scope, $resource, $routeParams, $timeout,
      ChatRoomFactory, UserService, MessageService, SocketIOServiceChat) {

  var chatRoomId = $routeParams.chatRoomId;

  ChatRoomFactory.get({ id: chatRoomId }, function(jsonResponse) {

    // Get Chat Room Information
    $scope.chatRoom = jsonResponse.chatRoom;

    // Get Chat room users
    $scope.users = jsonResponse.users;

    // Get Chat room messages
    $scope.messages = jsonResponse.messages;

    // Initialize User Active Information
    UserService.getActiveUser($scope);
  });

  // Create a new database message
  $scope.createMessage = function() {
    MessageService.createDatabaseMessage($scope);
  };

  // Allow to send only one emit server message
  var userTyping = false;
  var userTypingTimeout;
  // User Change message
  $scope.typing = function() {
    if (!userTyping) {
      userTyping = true;
      SocketIOServiceChat.emit('user:typing');
    }

    $timeout.cancel(userTypingTimeout);

    // User stop typing process
    userTypingTimeout = $timeout(function () {
      SocketIOServiceChat.emit('user:stop_typing');
      userTyping = false;
    }, 1000);
  };

  // Socket listeners

  // Update Online Users into system
  SocketIOServiceChat.on('user:join', function(data) {
    var chatRoomUsers = data.chatRoomUsers;
    $scope.onlineUsers = chatRoomUsers;
  });

  // User leave into your room
  SocketIOServiceChat.on('user:left', function(data) { 
    var chatRoomUsers = data.chatRoomUsers;
    $scope.onlineUsers = chatRoomUsers;
  });

  // Another Chat Room User begin typing message
  // List with all typing users
  $scope.typingUsers = new Array();
  SocketIOServiceChat.on('user:typing', function(responseData) {
    var user = responseData.user;

    var userExist = false;
    for (var iterator in $scope.typingUsers) {
      var tempUser = $scope.typingUsers[iterator];

      if (user.id === tempUser.id) {
        userExist = true;
        break;
      }
    }

    if (!userExist) {
      $scope.typingUsers.push(user);
    }
  });

  // Another Chat Room User stop typing message
  SocketIOServiceChat.on('user:stop_typing', function(responseData) {
    var user = responseData.user;

    for (var iterator in $scope.typingUsers) {
      var tempUser = $scope.typingUsers[iterator];

      if (user.id === tempUser.id) {
        $scope.typingUsers.splice(iterator);
        console.log($scope.typingUsers);
        break;
      }
    }
  });

  // Add new message a chat room
  SocketIOServiceChat.on('room:new_message', function(response) {
    var message = response.message;
    // Append response message to existing list
    $scope.messages.push(message);
  });


  // Socket listeners
}); // End controller chatRoom
// CONTROLLERS

