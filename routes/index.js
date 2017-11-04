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
var queueAddresses = [];
var minersOnline = 1;
// Important for speed, check api getInputs
var keyIndexStart = config.iota.keyIndexStart;
// cacheTrytes transaction data
var cacheTrytes;
// Count loops in queue
var queueTimer = 0;

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
    // Send actual queue
    sendQueuePosition();
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
            config.debug && console.log(new Date().toISOString()+" payoutPer1MHashes: " + payoutPer1MHashes);
        }
    });
}

function getTotalIotaPerSecond(){
    request.get({url: "https://api.coinhive.com/stats/site", qs: {"secret": config.coinhive.privateKey}}, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            var info = JSON.parse(body);
            totalIotaPerSecond = (info.hashesPerSecond*getHashIotaRatio()).toFixed(2);
            config.debug && console.log(new Date().toISOString()+" getTotalIotaPerSecond: " + totalIotaPerSecond);
            config.debug && console.log(new Date().toISOString()+" hashIotaRatio: " + hashIotaRatio);
            emitTotalIotaPerSecond(totalIotaPerSecond);
        }
    });
}

function  getXmrToBtc() {
    request.get({url: "https://api.coinmarketcap.com/v1/ticker/monero/"}, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            var info = JSON.parse(body);
            xmrToBtc = info[0].price_btc;
            config.debug && console.log(new Date().toISOString()+" xmrToBtc: " + xmrToBtc);
        }
    });
}

function  getIotaToBtc() {
    request.get({url: "https://api.coinmarketcap.com/v1/ticker/iota/"}, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            var info = JSON.parse(body);
            miotaToBtc = info[0].price_btc;
            config.debug && console.log(new Date().toISOString()+" miotaToBtc: " + miotaToBtc);
        }
    });
}

//#BLOCK QUEUE OF WITHDRAWAL FUNCTION
setInterval(function () {
    if(funqueue.length > 0 && !withdrawalInProgress) {
        // Reset timer for isReattachable
        queueTimer = 0;
        // Delete cache trytes transaction data
        cacheTrytes = null;
        // Set withdraw is in progress
        withdrawalInProgress = true;
        // Run function and remove first task
        (funqueue.shift())();
        // Remove socket id and socket for waiting list
        var queueId = queueIds.shift();
        config.debug && console.log(new Date().toISOString()+" Withdrawal in progress for "+queueId);
        queueSockets.shift();
        // Remove used address from array (get right position in queue)
        queueAddresses.shift();
        // Send to waiting sockets in queue their position
        sendQueuePosition();
    } else if (funqueue.length === 0 && hashIotaRatio > 0 && !withdrawalInProgress && env === "production"){
        // If queue is empty, make auto withdrawal to unpaid users
        config.debug && console.log(new Date().toISOString()+" Queue is empty, make auto withdrawal to unpaid users");

        // Reset timer for isReattachable
        queueTimer = 0;
        // Delete cache trytes transaction data
        cacheTrytes = null;
        // Set withdraw is in progress
        withdrawalInProgress = true;

        //getUsersList('');
        getTopUsers();
    }
}, 1000);

//#BLOCK TRYTES DATA WITHDRAW
function checkIfNodeIsSynced(address) {
    config.debug && console.log(new Date().toISOString()+" Checking if node is synced");

    iota.api.getNodeInfo(function(error, success){
        if(error) {
            config.debug && console.log(new Date().toISOString()+" Error occurred while checking if node is synced");
            config.debug && console.log(error);
            setTimeout(function(){
                //If node is not synced try it again after timeout
                checkIfNodeIsSynced(address);
            }, 1000);
        }

        const isNodeUnsynced =
            success.latestMilestone == config.iota.seed ||
            success.latestSolidSubtangleMilestone == config.iota.seed ||
            success.latestSolidSubtangleMilestoneIndex < success.latestMilestoneIndex;

        const isNodeSynced = !isNodeUnsynced;

        if(isNodeSynced) {
            config.debug && console.log(new Date().toISOString()+" Node is synced");
            getUserBalance(address);
        } else {
            config.debug && console.log(new Date().toISOString()+" Node is not synced.");
            withdrawalInProgress = false;
        }
    })
}

function getUserBalance(address){
    request.get({url: "https://api.coinhive.com/user/balance", qs: {"secret": config.coinhive.privateKey, "name":address}}, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            config.debug && console.log(body);
            var info = JSON.parse(body);
            // We can´t payout 0 value reward
            var valuePayout = Math.floor(info.balance*hashIotaRatio);
            if(valuePayout > 0){
                config.debug && console.log(new Date().toISOString()+" User: " + address + " Balance: " + info.balance + " HashIotaRatio: " + hashIotaRatio + " Payout: " + valuePayout);

                var noChecksumAddress;
                // Get only 81-trytes address format for sending
                // Check if username is valid address
                if(isAddress(address)){
                    // Check if address is 81-trytes address
                    if(isHash(address)){
                        noChecksumAddress = address;
                    } else { // If is address with checksum do check
                        if(isValidChecksum(address)){
                            // If is address correct, remove checksum
                            noChecksumAddress = noChecksum(address);
                        } else {
                            config.debug && console.log(new Date().toISOString()+" Invalid address checksum:");
                            config.debug && console.log(address);
                            withdrawalInProgress = false;
                        }
                    }
                }

                prepareLocalTransfer(address, noChecksumAddress, valuePayout);
            } else {
                withdrawalInProgress = false;
            }
        } else {
            withdrawalInProgress = false;
        }
    });
}

function prepareLocalTransfer(userName, noChecksumAddress, value){
    var transfer = [{
        'address': noChecksumAddress,
        'value': parseInt(value),
        'message': "MINEIOTADOTCOM",
        'tag': "MINEIOTADOTCOM"
    }];
    config.debug && console.log(new Date().toISOString()+' Transfer worker started');
    config.debug && console.time('trytes-time');
    // Worker for prepare TRYTES transfer
    var transferWorker = cp.fork('workers/transfer.js');

    transferWorker.send({keyIndex:keyIndexStart});
    transferWorker.send({totalValue:parseInt(value)});
    transferWorker.send(transfer);

    transferWorker.on('message', function(result) {
        // Receive results from child process
        //var data = JSON.parse(result);
        if(result.status == "success"){
            cacheTrytes = result.result;
            config.debug && console.log(cacheTrytes);
            //cacheTrytes is set, reset user balance on coinhive.com
            resetUserBalance(userName);
            doPow(cacheTrytes);
            //We store actual keyIndex for next faster search and transaction
            if(typeof result.keyIndex !== 'undefined'){
                keyIndexStart = result.keyIndex;
                config.debug && console.log(new Date().toISOString()+' Transfer: store actual keyIndex: '+result.keyIndex);
            }
            if(typeof result.inputAddress !== 'undefined'){
                config.debug && console.log(new Date().toISOString()+' Now waiting at confirmation of transaction: '+result.inputAddress);
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
        config.debug && console.log(new Date().toISOString()+' Closing transfer worker');
        config.debug && console.timeEnd('trytes-time');
    });
}

function resetUserBalance(userName){
    config.debug && console.log("resetUserBalance: "+userName);
    request.post({url: "https://api.coinhive.com/user/reset", form: {"secret": config.coinhive.privateKey, "name":userName}}, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            config.debug && console.log(new Date().toISOString()+" Reset coinhive.com balance result:");
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
            for (var i = (parseInt(data.users.length)-parseInt(1)), len = data.users.length; i < len; i++) {
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
                            console.log(new Date().toISOString()+" invalid checksum: ");
                            console.log(userName);
                        }
                    }
                }
                transfers.push({
                    "address" : destinationAddress,
                    "value"  : parseInt(Math.floor(data.users[i].balance*hashIotaRatio)),
                    "message" : "MINEIOTADOTCOM",
                    'tag': "MINEIOTADOTCOM"
                });
                resetUserBalance(userName);
                // Add just one user to auto withdrawal transaction
                config.debug && console.log(transfers);
                break;
            }
            prepareLocalTransfers(transfers, totalValue);
        } else {
            withdrawalInProgress = false;
        }
    });
}

function getTopUsers(){
    request.get({url: "https://api.coinhive.com/user/top", qs: {"secret": config.coinhive.privateKey,"count":1,"order":"balance"}}, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            var transfers = [];
            var totalValue = 0;
            var data = JSON.parse(body);
            for (var i = 0, len = data.users.length; i < len; i++) {
                totalValue += Math.floor(data.users[i].balance*hashIotaRatio);
                console.log(new Date().toISOString()+" Total value auto withdrawal "+totalValue + " / " + config.automaticWithdrawalMinimumAmount);
                if(totalValue > config.automaticWithdrawalMinimumAmount){
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
                                console.log(new Date().toISOString()+" invalid checksum: ");
                                console.log(userName);
                            }
                        }
                    }
                    transfers.push({
                        "address" : destinationAddress,
                        "value"  : parseInt(Math.floor(data.users[i].balance*hashIotaRatio)),
                        "message" : "MINEIOTADOTCOM",
                        'tag': "MINEIOTADOTCOM"
                    });
                    config.debug && console.log(transfers);
                    resetUserBalance(userName);
                    // Add just one user to auto withdrawal transaction
                } else {
                    withdrawalInProgress = false;
                    return;
                }
                break;
            }
            prepareLocalTransfers(transfers, totalValue);
        } else {
            withdrawalInProgress = false;
        }
    });
}

function prepareLocalTransfers(transfers, totalValue){

    config.debug && console.log(new Date().toISOString()+' Transfer worker started');
    config.debug && console.time('trytes-time');
    // Worker for prepare TRYTES transfer
    var transferWorker = cp.fork('workers/transfer.js');

    transferWorker.send({keyIndex:keyIndexStart});
    transferWorker.send({totalValue:totalValue});
    transferWorker.send(transfers);

    transferWorker.on('message', function(result) {
        // Receive results from child process
        //var data = JSON.parse(result);
        if(result.status == "success"){
            cacheTrytes = result.result;
            config.debug && console.log(cacheTrytes);
            doPow(cacheTrytes);

            //We store actual keyIndex for next faster search and transaction
            if(typeof result.keyIndex !== 'undefined'){
                keyIndexStart = result.keyIndex;
                config.debug && console.log(new Date().toISOString()+' Transfer: store actual keyIndex: '+result.keyIndex);
            }
            if(typeof result.inputAddress !== 'undefined'){
                config.debug && console.log(new Date().toISOString()+' Now waiting at confirmation of transaction: '+result.inputAddress);
                checkReattachable(result.inputAddress);
            } else {
                // Something wrong, next in queue can go
                withdrawalInProgress = false;
            }

        } else if (result.status == "error"){
            config.debug && console.log(cacheTrytes);
            // We are done, next in queue can go
            withdrawalInProgress = false;
        }
        transferWorker.kill();
    });
    transferWorker.on('close', function () {
        config.debug && console.log(new Date().toISOString()+' Closing transfer worker');
        config.debug && console.timeEnd('trytes-time');
    });
}

function sendQueuePosition(){
    if(queueSockets !== undefined ) {
        queueSockets.forEach(function (queueSocket){
            config.debug && console.log(new Date().toISOString()+" "+queueSocket.id+" is in queue " + (parseInt(queueIds.indexOf(queueSocket.id))+parseInt(1)));
            queueSocket.emit('queuePosition', {position: (parseInt(queueIds.indexOf(queueSocket.id))+parseInt(1))});
        });
    }
    if(sockets !== undefined ) {
        sockets.forEach(function (socket){
            socket.emit('queueTotal', {total: queueSockets.length});
        });
    }
}

//#BLOCK CHECKING CONFIRMED TRANSACTION BEFORE SEND NEW ROUND
var waitConfirm;
var inputAddressConfirm;
function checkReattachable(inputAddress){
    inputAddressConfirm = inputAddress;
    waitConfirm = setInterval(isReattachable, 60000);
}
// Checking if transaction is confirmed
function isReattachable(){
    if(inputAddressConfirm !== null) {
        queueTimer++;
        iota.api.isReattachable(inputAddressConfirm, function (errors, Bool) {
            // If false, transaction was confirmed
            if (!Bool) {
                // STOP with setInterval until is called again
                clearInterval(waitConfirm);
                // We are done, next in queue can go
                config.debug && console.log(new Date().toISOString()+" Success: Transaction is confirmed: " + inputAddressConfirm);
                withdrawalInProgress = false;
                // Delete cache trytes transaction data because you do not need boost anymore
                cacheTrytes = null;
                queueTimer = 0;
                inputAddressConfirm = null;
            } else if (isInteger(parseInt(queueTimer)/parseInt(5))) {
                // Add one minute to queue timer
                // On every 5 minutes in queue, sdo PoW again
                config.debug && console.log(new Date().toISOString()+' Failed: Do PoW again ');
                doPow(cacheTrytes);
            } else {
                config.debug && console.log(new Date().toISOString()+' Miners online: '+sockets.length);
                config.debug && console.log(new Date().toISOString()+' Actual queue run for minutes: '+queueTimer);
                config.debug && console.log(new Date().toISOString()+' Transactions in queue: '+funqueue.length);
                config.debug && console.log(new Date().toISOString()+' Waiting on transaction confirmation: ' + inputAddressConfirm);
            }
        });
    }
}

function doPow(trytes){
    config.debug && console.log(new Date().toISOString()+" PoW worker started");
    config.debug && console.time('pow-time');
    // Worker for get IOTA balance in interval
    var powWorker = cp.fork('workers/pow.js');
    // Send child process work to get IOTA balance
    //We pass to worker keyIndex where start looking for funds
    powWorker.send({trytes:trytes});

    powWorker.on('message', function(trytesResult) {
        // Receive results from child process
        // Get completed transaction info
        //config.debug && console.log(trytesResult);
        // Get only hash from attached transaction
        config.debug && console.log("Success: hash from attached transaction " + trytesResult[0].hash);
        emitAttachedHash(trytesResult[0].hash);
        powWorker.kill();
    });
    powWorker.on('close', function () {
        config.debug && console.log(new Date().toISOString()+' Closing PoW worker');
        config.debug && console.timeEnd('pow-time');
    });
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
// Check if it is rounded interger and not float
function isInteger(n) {
    return n === +n && n === (n|0);
}
//#BLOCK BALANCE
// Set interval for balance request
setBalance();
setInterval(setBalance, 60000);
// Set balance per period to variable for access it to users

function setBalance(){
    config.debug && console.log(new Date().toISOString()+" Balance worker started");
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
            config.debug && console.log(new Date().toISOString()+' Balance: store actual keyIndex: '+balanceResult.inputs[0].keyIndex);
        }
        config.debug && console.log(new Date().toISOString()+" Faucet balance: " + balanceResult.totalBalance);
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
        config.debug && console.log(new Date().toISOString()+' Closing balance worker');
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
    socket.on('disconnect', function(){
        var i = sockets.indexOf(socket);
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
        var fullAddress = data.address;
        config.debug && console.log("Requesting withdraw for address: " + fullAddress);
        if(isAddress(fullAddress)){
            // Check if withdrawal request inst already in queue
            if(queueAddresses.indexOf(fullAddress) >= 0){
                fn({done:-1,position:(parseInt(queueAddresses.indexOf(fullAddress))+parseInt(1))});
            } else {
                //Add withdraw request to queue
                function withdrawRequest() { checkIfNodeIsSynced(fullAddress); }
                // Respond success
                fn({done:1});
                // Push function checkIfNodeIsSynced to array
                funqueue.push(withdrawRequest);
                // Push socket id to array for get position in queue
                queueIds.push(socket.id);
                // Push full socket to array
                queueSockets.push(socket);
                // Push address to array
                queueAddresses.push(fullAddress);
                // Send to client position in queue
                config.debug && console.log(fullAddress+" is in queue " + (parseInt(queueIds.indexOf(socket.id))+parseInt(1)));
                socket.emit('queuePosition', {position: (parseInt(queueIds.indexOf(socket.id))+parseInt(1))});
            }
        } else {
            // Respond error
            fn({done:0});
        }
    });
    //When user complete boost PoW, send hash transaction to all clients
    socket.on('newWithdrawalConfirmation', function (data) {
        emitAttachedHash(data.hash);
    });
    socket.on('boostRequest', function () {
        if(cacheTrytes != null){
        socket.emit("boostAttachToTangle", cacheTrytes, function(confirmation){
            if(confirmation.success == true){
                config.debug && console.log(new Date().toISOString()+ " "+socket.id+' emit attachToTangle to client success');
            } else {
                config.debug && console.log(new Date().toISOString()+ " "+socket.id+' emit attachToTangle to client failed, maybe is disconnected or already do PoW');
            }
        });
        } else {
            socket.emit('announcement', "No unconfirmed transaction for boost. Thank you for your help");
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
// Emit hash of attached transaction
function emitAttachedHash(hash){
    if(sockets != undefined ) {
        sockets.forEach(function (socketSingle){
            socketSingle.emit('lastPayout', {hash: hash});
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
