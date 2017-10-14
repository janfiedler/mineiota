var express = require('express');
var http = require('http').Server(express);
var io = require('socket.io')(http);
var request = require('request');
var IOTA = require('iota.lib.js');
var router = express.Router();

var env = process.env.NODE_ENV || 'development';
var config = require('../config')[env];

var sockets = [];
var balance = 0;
var xmrToBtc = 0;
var miotaToBtc = 0;
var payoutPer1MHashes = 0;
var hashIotaRatio = 0;
var totalIotaPerSecond = 0;
var final = 0;
var withdrawalInProgress = false;
var funqueue = [];
var queueIds = [];
var queueSockets = [];
var minersOnline = 1;

var cp = require('child_process');
// Worker for get IOTA balance in interval
var balanceWorker = cp.fork('workers/balance.js');
// Worker for prepare TRYTES transfer
var transferWorker = cp.fork('workers/transfer.js');
// Create IOTA instance with host and port as provider
var iota = new IOTA({
    'host': config.iota.host,
    'port': config.iota.port
});

// Init
// Request on startup

getPayoutPer1MHashes();
getXmrToBtc();
getIotaToBtc();

setInterval(function () {
    getPayoutPer1MHashes();
    getXmrToBtc();
    getIotaToBtc();
    // Emit actual iota/s speed
    getTotalIotaPerSecond();
}, 60000);


function isAddress(address){
    return iota.valid.isAddress(address);
}
// Withdraw queue function
setInterval(function () {
    if(funqueue.length > 0 && !withdrawalInProgress) {
        // Set withdraw is in progress
        withdrawalInProgress = true;
        // Run and remove first task
        (funqueue.shift())();
        // Remove socket id and socket for waiting list
        queueIds.shift();
        queueSockets.shift();
        // Send to waiting sockets in queue their position
        sendQueuePosition();
    } else {
        config.debug && console.log('Miners online: '+sockets.length);
        config.debug && console.log(funqueue.length + ' is in queue List: '+ JSON.stringify(funqueue));
    }
}, 10000);

function sendQueuePosition(){
    if(queueSockets != undefined ) {
        queueSockets.forEach(function (queueSocket){
            config.debug && console.log(queueSocket.id+" is in queue " + queueIds.indexOf(queueSocket.id)+1);
            queueSocket.emit('queuePosition', {position: queueIds.indexOf(queueSocket.id)+1});
        });
    }
};
io.on('connection', function (socket) {
    // Set new connection socket to array
    sockets.push(socket);
    // Get number of online miners
    emitMinersOnline();
    // Emit actual balance to new client
    emitBalance(socket, balance);

    // On disconnect remove socket from array sockets
    socket.on('disconnect', function(data){
        //console.log("Sockets before: " + sockets);
        var i = sockets.indexOf(socket);
        //console.log("Disconnected: " + i);
        if(i != -1) {
            sockets.splice(i, 1);
        }
        emitMinersOnline();
    });

    //When user set address check if is valid format
    socket.on('login', function (data, fn) {
        if(isAddress(data.address)){
            fn({publicKey:config.coinhive.publicKey,username:data.address});
        } else {
            fn(false);
        }
    });

    //When user with request withdraw
    socket.on('withdraw', function(data, fn) {
        config.debug && console.log("Requesting withdraw to address: " + data.address);

        if(isAddress(data.address)){
            //Add withdraw request to queue
            function withdrawRequest() { checkIfNodeIsSynced(socket, data.address); };
            fn({done:1});
            funqueue.push(withdrawRequest);
            queueIds.push(socket.id);
            queueSockets.push(socket);
            // Send to client position in queue
            config.debug && console.log(data.address+" is in queue " + queueIds.indexOf(socket.id)+1);
            socket.emit('queuePosition', {position: queueIds.indexOf(socket.id)+1});
        } else {
            fn({done:0});
        }
    });
    //When user set address check if is valid format
    socket.on('spreadPayout', function (data) {
        if(sockets != undefined ) {
            sockets.forEach(function (socketSingle){
                emitBalance(socket, balance);
                socketSingle.emit('lastPayout', {hash: data.hash});
            });
        }
    });
});

function checkIfNodeIsSynced(socket, address) {
    config.debug && console.log("Checking if node is synced");

    iota.api.getNodeInfo(function(error, success){
        if(error) {
            config.debug && console.log("Error occurred while checking if node is synced");
            withdrawalInProgress = false;
            return false;
        }

        const isNodeUnsynced =
            success.latestMilestone == config.iota.seed ||
            success.latestSolidSubtangleMilestone == config.iota.seed ||
            success.latestSolidSubtangleMilestoneIndex < success.latestMilestoneIndex

        const isNodeSynced = !isNodeUnsynced

        if(isNodeSynced) {
            config.debug && console.log("Node is synced");
            getUserBalance(socket, address);
        } else {
            config.debug && console.log("Node is not synced.");
            withdrawalInProgress = false;
        }
    })
}
function getUserBalance(socket, address){
    request.get({url: "https://api.coinhive.com/user/balance", qs: {"secret": config.coinhive.privateKey, "name":address}}, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            config.debug && console.log(body);
            var info = JSON.parse(body);
            config.debug && console.log("User: " + address + " Balance: " + info.balance + " HashIotaRatio: " + hashIotaRatio + " Payout: " + Math.floor(info.balance*hashIotaRatio));
            prepareLocalTransfers(socket, address, Math.floor(info.balance*hashIotaRatio));
        } else {
            withdrawalInProgress = false;
        }
    });
}
function prepareLocalTransfers(socket, address, value){
    var transfer = [{
        'address': address,
        'value': parseInt(value),
        'message': "MINEIOTADOTCOM"
    }];
    transferWorker.send(transfer);

    transferWorker.on('message', function(result) {
        // Receive results from child process
        //var data = JSON.parse(result);
        if(result.status == "success"){
            config.debug && console.log(result.result);
            //Before send trytes to attach, reset user balance on coinhive.com
            resetUserBalance(address);
            socket.emit("attachToTangle", result.result);
            // We are done, next in queue can go
            withdrawalInProgress = false;
        } else if (result.status == "error"){
            config.debug && console.log(result.result);
            socket.emit("prepareError", result.result);
            // We are done, next in queue can go
            withdrawalInProgress = false;
        }
    });
}
function resetUserBalance(address){
    config.debug && console.log("resetUserBalance: "+address);
    request.post({url: "https://api.coinhive.com/user/reset", form: {"secret": config.coinhive.privateKey, "name":address}}, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            config.debug && console.log(body);
        }
    });
}
// Set interval for balance request
setBalance();
setInterval(setBalance, 300000);

// Set balance per period to variable for access it to users
function setBalance(){
    // Send child process work to get IOTA balance
    balanceWorker.send('');
}

balanceWorker.on('message', function(balanceValue) {
    // Receive results from child process
    config.debug && console.log("Faucet balance: " + balanceValue);
    if(Number.isInteger(balanceValue)){
        balance = balanceValue;
    }

    // Emit new balance to all connected users
    if(sockets != undefined ) {
        sockets.forEach(function (socket){
            emitBalance(socket, balance);
        });
    }
});

function emitMinersOnline(){
    if(sockets != undefined ) {
        sockets.forEach(function (socketSingle){
            socketSingle.emit('minersOnline', {count: sockets.length});
        });
    }
}
function emitTotalIotaPerSecond(count){
    if(sockets != undefined ) {
        sockets.forEach(function (socketSingle){
            socketSingle.emit('totalIotaPerSecond', {count: count});
        });
    }
}
// Emit balance to connected user
function emitBalance(socket, balanceValue){
    socket.emit('balance', { balance: balanceValue, hashIotaRatio: getHashIotaRatio() });
}

function getHashIotaRatio(){
    // CoinHive convert BTC payout per 1 milion monero hashes
    var xmrInBtcPayout  = xmrToBtc / (1 / payoutPer1MHashes);
    //Convert monero BTC reward to per hash and btc price per 1x iota not million iotas. Ang get result how many iota per coinhive hash
    final = (xmrInBtcPayout/1000000) / (miotaToBtc / 1000000);
    final = final / (100 / config.coinhive.feeRatio);
    hashIotaRatio = final;
    return hashIotaRatio;
}

function getPayoutPer1MHashes(){
    request.get({url: "https://api.coinhive.com/stats/payout", qs: {"secret": config.coinhive.privateKey}}, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            var info = JSON.parse(body);
            payoutPer1MHashes = info.payoutPer1MHashes;
            config.debug && console.log("payoutPer1MHashes: " + payoutPer1MHashes);
        }
    });
}
function getTotalIotaPerSecond(){
    request.get({url: "https://api.coinhive.com/stats/site", qs: {"secret": config.coinhive.privateKey}}, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            var info = JSON.parse(body);
            totalIotaPerSecond = (info.hashesPerSecond*getHashIotaRatio()).toFixed(2);
            config.debug && console.log("getTotalIotaPerSecond: " + totalIotaPerSecond);
            emitTotalIotaPerSecond(totalIotaPerSecond);
        }
    });
}

function  getXmrToBtc() {
    request.get({url: "https://api.coinmarketcap.com/v1/ticker/monero/"}, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            var info = JSON.parse(body);
            xmrToBtc = info[0].price_btc;
            config.debug && console.log("xmrToBtc: " + xmrToBtc);
        }
    });
}

function  getIotaToBtc() {
    request.get({url: "https://api.coinmarketcap.com/v1/ticker/iota/"}, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            var info = JSON.parse(body);
            miotaToBtc = info[0].price_btc;
            config.debug && console.log("miotaToBtc: " + miotaToBtc);
        }
    });
}

// WebSocket  SOCKET.IO listening
http.listen(config.WebSocket.port, function(){
});

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'IOTA Faucet - Get IOTA through mining Monero', WebSocketHost:"'"+config.url+':'+config.WebSocket.listenPort+"'", iotaProvider:"'"+config.iota.host+':'+config.iota.port+"'" });
});

module.exports = router;
