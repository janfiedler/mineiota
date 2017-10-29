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
// Important for speed, check api getInputs
var keyIndexStart = config.iota.keyIndexStart;

// List of https providers
const httpsProviders = [
    "https://iota.onlinedata.cloud:443"
];
var _currentProvider = getRandomProvider();

function getRandomProvider() {
    return httpsProviders[Math.floor(Math.random() * httpsProviders.length)]
}
console.log(_currentProvider);

// Multi threading
var cp = require('child_process');
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

// #BLOCK GET ALL NEEDED DATA FOR CALCULATE PAYOUT
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

//#BLOCK TRYTES DATA WITHDRAW
function checkIfNodeIsSynced(socket, address) {
    config.debug && console.log("Checking if node is synced");

    iota.api.getNodeInfo(function(error, success){
        if(error) {
            config.debug && console.log("Error occurred while checking if node is synced");
            config.debug && console.log(error);
            socket.emit("prepareError", '');
            withdrawalInProgress = false;
            return false;
        }

        const isNodeUnsynced =
            success.latestMilestone == config.iota.seed ||
            success.latestSolidSubtangleMilestone == config.iota.seed ||
            success.latestSolidSubtangleMilestoneIndex < success.latestMilestoneIndex;

        const isNodeSynced = !isNodeUnsynced;

        if(isNodeSynced) {
            config.debug && console.log("Node is synced");
            getUserBalance(socket, address);
        } else {
            config.debug && console.log("Node is not synced.");
            socket.emit("prepareError", '');
            withdrawalInProgress = false;
        }
    })
}
function getUserBalance(socket, address){
    request.get({url: "https://api.coinhive.com/user/balance", qs: {"secret": config.coinhive.privateKey, "name":address}}, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            config.debug && console.log(body);
            var info = JSON.parse(body);
            // We can´t payout 0 value reward
            var valuePayout = Math.floor(info.balance*hashIotaRatio);
            if(valuePayout > 0){
                config.debug && console.log("User: " + address + " Balance: " + info.balance + " HashIotaRatio: " + hashIotaRatio + " Payout: " + valuePayout);
                prepareLocalTransfer(socket, address, valuePayout);
            } else {
                socket.emit("zeroValueRequest", "");
                withdrawalInProgress = false;
            }
        } else {
            withdrawalInProgress = false;
        }
    });
}
function prepareLocalTransfer(socket, address, value){
    var transfer = [{
        'address': address,
        'value': parseInt(value),
        'message': "MINEIOTADOTCOM"
    }];
    config.debug && console.log('Transfer worker started');
    config.debug && console.time('trytes-time');
    // Worker for prepare TRYTES transfer
    var transferWorker = cp.fork('workers/transfer.js');

    transferWorker.send({keyIndex:keyIndexStart});
    transferWorker.send(transfer);

    transferWorker.on('message', function(result) {
        // Receive results from child process
        //var data = JSON.parse(result);
        if(result.status == "success"){
            config.debug && console.log(result.result);
            socket.emit("attachToTangle", result.result, function(confirmation){
                if(confirmation.success == true){
                    //After send trytes to attach, reset user balance on coinhive.com
                    resetUserBalance(address);
                } else {
                    config.debug && console.log('emit attachToTangle to client failed, maybe is disconnected');
                    // Something wrong, next in queue can go
                    withdrawalInProgress = false;
                }
            });

            //We store actual keyIndex for next faster search and transaction
            if(typeof result.keyIndex !== 'undefined'){
                keyIndexStart = result.keyIndex;
                config.debug && console.log('Transfer: store actual keyIndex: '+result.keyIndex);
            }
            if(typeof result.inputAddress !== 'undefined'){
                config.debug && console.log('Now waiting at confirmation of transaction: '+result.inputAddress);
                checkReattachable(result.inputAddress);
            } else {
                // Something wrong, next in queue can go
                withdrawalInProgress = false;
            }

        } else if (result.status == "error"){
            config.debug && console.log(result.result);
            socket.emit("prepareError", result.result);
            // We are done, next in queue can go
            withdrawalInProgress = false;
        }
        transferWorker.kill();
    });
    transferWorker.on('close', function () {
        config.debug && console.log('Closing transfer worker');
        config.debug && console.timeEnd('trytes-time');
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

function getUsersList(page){
    request.get({url: "https://api.coinhive.com/user/list", qs: {"secret": config.coinhive.privateKey,"count":8192,"page":page}}, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            var transfers = [];
            var totalValue = 0;
            var data = JSON.parse(body);
            config.debug && console.log("getUserList:");
            for (var i = 0, len = data.users.length; i < len; i++) {
                totalValue += Math.floor(data.users[i].balance*hashIotaRatio);
                var destinationAddress;
                var userName = data.users[i].name;
                // Get only 81-trytes address format for sending
                // Check if username is valid address
                if(isAddress(userName)){
                    // Check if address is 81-trytes address
                    if(isHash(userName)){
                        destinationAddress = userName;
                    } else { // If is address with checksum do check
                        if(isValidChecksum(userName)){
                            // If is address correct, remove checksum
                            destinationAddress = noChecksum(userName);
                        } else {
                            console.log("invalid checksum: ");
                            console.log(userName);
                        }
                    }
                }
                transfers.push({
                    "address" : destinationAddress,
                    //"value"  : parseInt(Math.floor(data.users[i].balance*hashIotaRatio)),
                    "value" : parseInt(0),
                    "message" : "MINEIOTADOTCOM"
                });
            }
            prepareLocalTransfers(transfers, totalValue);
        } else {
            withdrawalInProgress = false;
        }
    });
}

function prepareLocalTransfers(transfers, totalValue){

    config.debug && console.log('Transfer worker started');
    config.debug && console.time('trytes-time');
    // Worker for prepare TRYTES transfer
    var transferWorker = cp.fork('workers/transfer.js');

    transferWorker.send({keyIndex:keyIndexStart});
    //transferWorker.send({totalValue:totalValue});
    transferWorker.send({totalValue:0});
    transferWorker.send(transfers);

    transferWorker.on('message', function(result) {
        // Receive results from child process
        //var data = JSON.parse(result);
        if(result.status == "success"){
            config.debug && console.log(result.result);
            sendTrytesToAll(result.result);

            //We store actual keyIndex for next faster search and transaction
            if(typeof result.keyIndex !== 'undefined'){
                keyIndexStart = result.keyIndex;
                config.debug && console.log('Transfer: store actual keyIndex: '+result.keyIndex);
            }
            if(typeof result.inputAddress !== 'undefined'){
                config.debug && console.log('Now waiting at confirmation of transaction: '+result.inputAddress);
                checkReattachable(result.inputAddress);
            } else {
                // Something wrong, next in queue can go
                withdrawalInProgress = false;
            }

        } else if (result.status == "error"){
            config.debug && console.log(result.result);
            // We are done, next in queue can go
            withdrawalInProgress = false;
        }
        transferWorker.kill();
    });
    transferWorker.on('close', function () {
        config.debug && console.log('Closing transfer worker');
        config.debug && console.timeEnd('trytes-time');
    });
}

function sendTrytesToAll(trytes){
    if(sockets != undefined ) {
        sockets.forEach(function (socket){
            config.debug && console.log(socket.id+" sending trytes");
            socket.emit("attachToTangle", trytes, function(confirmation){
                if(confirmation.success == true){
                    //After send trytes to attach, reset user balance on coinhive.com
                    config.debug && console.log(socket.id+' emit attachToTangle to client success');
                } else {
                    config.debug && console.log(socket.id+' emit attachToTangle to client failed, maybe is disconnected');
                }
            });
        });
    }
}

//#BLOCK QUEUE OF WITHDRAWAL FUNCTION
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
        config.debug && console.log('Transactions in queue: '+funqueue.length);
    }
}, 60000);

function sendQueuePosition(){
    if(queueSockets != undefined ) {
        queueSockets.forEach(function (queueSocket){
            config.debug && console.log(queueSocket.id+" is in queue " + (parseInt(queueIds.indexOf(queueSocket.id))+parseInt(1)));
            queueSocket.emit('queuePosition', {position: (parseInt(queueIds.indexOf(queueSocket.id))+parseInt(1))});
        });
    }
}

//#BLOCK CHECKING CONFIRMED TRANSACTION BEFORE SEND NEW ROUND
var waitConfirm;
var inputAddressConfirm;
function checkReattachable(inputAddress){
    inputAddressConfirm = inputAddress;
    waitConfirm = setInterval(isReattachable, 10000);
}
// Checking if transaction is confirmed
function isReattachable(){
    if(inputAddressConfirm !== null) {
        iota.api.isReattachable(inputAddressConfirm, function (errors, Bool) {

            // If false, transaction was confirmed
            if (!Bool) {
                clearInterval(waitConfirm);
                // We are done, next in queue can go
                config.debug && console.log("Transaction is confirmed: " + inputAddressConfirm);
                withdrawalInProgress = false;
                inputAddressConfirm = null;
            } else {
                config.debug && console.log("Waiting on transaction confirmation: " + inputAddressConfirm);
            }
        });
    }
}

//# BLOCK HELPERS FUNCTIONS
function isAddress(address){
    return iota.valid.isAddress(address);
}
function isHash(hash){
    return iota.valid.isHash(hash);
}
function isValidChecksum(addressWithChecksum){
    return iota.utils.isValidChecksum(addressWithChecksum);
}
function noChecksum(addressWithChecksum){
    return iota.utils.noChecksum(addressWithChecksum);
}
//#BLOCK BALANCE
// Set interval for balance request
setBalance();
//setInterval(setBalance, 60000);
// Set balance per period to variable for access it to users
function setBalance(){
    config.debug && console.log("Balance worker started");
    config.debug && console.time('balance-time');
    // Worker for get IOTA balance in interval
    var balanceWorker = cp.fork('workers/balance.js');
    // Send child process work to get IOTA balance
    //We pass to worker keyIndex where start looking for funds
    balanceWorker.send({keyIndexStart:keyIndexStart});

    balanceWorker.on('message', function(balanceResult) {
        // Receive results from child process
        config.debug && console.log(balanceResult);
        if(typeof balanceResult.inputs !== 'undefined' && balanceResult.inputs.length > 0){
            //We store actual keyIndex for next faster search and transaction
            keyIndexStart = balanceResult.inputs[0].keyIndex;
            config.debug && console.log('Balance: store actual keyIndex: '+balanceResult.inputs[0].keyIndex);
        }
        config.debug && console.log("Faucet balance: " + balanceResult.totalBalance);
        if(Number.isInteger(balanceResult.totalBalance)){
            balance = balanceResult.totalBalance;
        } else {
            balance = "NODES are down, withdrawal do not work, please wait!"
        }
        // Emit new balance to all connected users
        if(sockets != undefined ) {
            sockets.forEach(function (socket){
                emitBalance(socket, balance);
            });
        }
        balanceWorker.kill();
    });
    balanceWorker.on('close', function () {
        config.debug && console.log('Closing balance worker');
        config.debug && console.timeEnd('balance-time');
    });
}

// SOCKET.IO Communication
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
            function withdrawRequest() { checkIfNodeIsSynced(socket, data.address); }
            fn({done:1});
            funqueue.push(withdrawRequest);
            queueIds.push(socket.id);
            queueSockets.push(socket);
            // Send to client position in queue
            config.debug && console.log(data.address+" is in queue " + (parseInt(queueIds.indexOf(socket.id))+parseInt(1)));
            socket.emit('queuePosition', {position: (parseInt(queueIds.indexOf(socket.id))+parseInt(1))});
        } else {
            fn({done:0});
        }
    });
    //When user complete withdrawal, send last payout to all clients
    socket.on('newWithdrawalConfirmation', function (data) {
        if(sockets != undefined ) {
            sockets.forEach(function (socketSingle){
                socketSingle.emit('lastPayout', {hash: data.hash});
            });
        }
    });
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

// WebSocket  SOCKET.IO listening
http.listen(config.WebSocket.port, function(){
});

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'IOTA Faucet - Get IOTA through mining Monero', WebSocketHost:"'"+config.url+':'+config.WebSocket.listenPort+"'", iotaProvider:"'"+config.iota.host+':'+config.iota.port+"'" });
});

module.exports = router;
