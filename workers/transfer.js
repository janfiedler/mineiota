var env = process.env.NODE_ENV || 'development';
var config = require('../config')[env];

var IOTA = require('iota.lib.js');
// Create IOTA instance with host and port as provider
var iota = new IOTA({
    'host': config.iota.host,
    'port': config.iota.port
});
var keyIndexStart;

process.on('message', function(message) {
    if(typeof message.keyIndex !== 'undefined'){
        //Set keyIndex for next use
        keyIndexStart = message.keyIndex;
    } else if(typeof message[0].value !== 'undefined')  {
        // Set custom options with keyIndex and value to transaction
        var options = {
            'start': parseInt(keyIndexStart),
            'security': parseInt(2),
            'threshold': parseInt(message[0].value)
        };
        iota.api.getInputs(config.iota.seed, options, function (error, inputsData) {
            if (error) {
                process.send(error);
            } else {
                //use received data from getInputs for transaction
                var options = {
                    'inputs': inputsData.inputs,
                    'security': parseInt(2)
                };
                iota.api.prepareTransfers(config.iota.seed, message, options, function (error, success) {
                    if (error) {
                        console.log(error);
                        process.send({status: "error", result: error});
                    } else {
                        console.log(success);
                        process.send({status: "success", result: success, keyIndex: inputsData.inputs[0].keyIndex});
                    }
                });
            }
        });
    }
});