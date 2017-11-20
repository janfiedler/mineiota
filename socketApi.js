var socket_io = require('socket.io');
var io = socket_io();
var socketApi = {};
var sockets = [];

socketApi.io = io;
/*
io.on('connection', function(socket){
    // Set new connection socket to array
    sockets.push(socket);

    // On disconnect remove socket from array sockets
    socket.on('disconnect', function(){
        var i = sockets.indexOf(socket);
        if(i != -1) {
            sockets.splice(i, 1);
        }
    });
});
*/

module.exports = socketApi;