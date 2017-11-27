var env = process.env.NODE_ENV || 'development';
var config = require('../config')[env];

var IOTA = require('iota.lib.js');
// Create IOTA instance with host and port as provider
var iota = new IOTA({
    'host': config.iota.host,
    'port': config.iota.port
});

var localAttachToTangle = function(trunkTransaction, branchTransaction, minWeightMagnitude, trytes, callback) {

    var ccurlHashing = require("../ccurl/index");

    ccurlHashing(trunkTransaction, branchTransaction, minWeightMagnitude, trytes, function(error, success) {
        if (error) {
            config.debug && console.log("Error Light Wallet: ccurl.ccurlHashing finished");
            config.debug && console.log(error);
        } else {
            //config.debug && console.log("Success Light Wallet: ccurl.ccurlHashing finished");
        }
        if (callback) {
            return callback(error, success);
        } else {
            return success;
        }
    });
};

iota.api.attachToTangle = localAttachToTangle;

var depth = 12;
var minWeightMagnitude = 14;

function generateSeed() {
    const validChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ9';
    return Array.from(new Array(81), (x, i) => validChars[Math.floor(Math.random() * validChars.length)]).join('');
}

var options = {
    'inputs': [],
    'address' : "999999999999999999999999999999999999999999999999999999999999999999999999999999999",
    'security': 2
};

var spamTransfer = [{
    address: "999999999999999999999999999999999999999999999999999999999999999999999999999999999",
    value: 0,
    message: "CONFIRM9TRANSACTIONS9IN9TANGLE9WITH9WITH9CCURL",
    tag: "SPAMMER9MINEIOTADOTCOM"
}];

iota.api.prepareTransfers(generateSeed(), spamTransfer, options, function (error, success) {
    if (error) {
        process.send({error:1,data:error});
    } else {
        iota.api.sendTrytes(success, depth, minWeightMagnitude, function (error, success) {
            if (error) {
                process.send({error:1,data:error});
            } else {
                process.send(success);
            }
        });
    }
});
