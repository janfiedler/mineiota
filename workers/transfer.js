var env = process.env.NODE_ENV || 'development';
var config = require('../config')[env];

var IOTA = require('iota.lib.js');
// Create IOTA instance with host and port as provider
var iota = new IOTA({
    'host': config.iota.host,
    'port': config.iota.port
});
var keyIndexStart;
var seed;
var totalValue = 0;

process.on('message', function(data) {
    if(typeof data.keyIndex !== 'undefined'){
        //Set keyIndex for next use
        seed = data.seed;
        keyIndexStart = data.keyIndex;
    } else if(typeof data.totalValue !== 'undefined'){
        //Set keyIndex for next use
        totalValue = data.totalValue;
    } else if(typeof data[0].value !== 'undefined')  {
        // Set custom options with keyIndex and total value for getInputs
        var options = {
            'start': parseInt(keyIndexStart),
            'security': parseInt(2),
            'threshold': parseInt(totalValue)
        };
        console.log(options);
        // Get inputs for next transaction by options
        iota.api.getInputs(seed, options, function (error, inputsData) {
            if (error) {
                process.send({status: "error", result: error});
                config.debug && console.log(error);
            } else {
                // Loop or keyIndex, get new index from last
                var keyIndexNew;
                for (var i = 0, len = inputsData.inputs.length; i < len; i++) {
                    keyIndexNew = inputsData.inputs[i].keyIndex;
                }
                // Add +1 for new address
                keyIndexNew = (parseInt(keyIndexNew) + parseInt(1));

                // Specify option for faster generating new address
                var options = {
                    'index' : keyIndexNew,
                    'checksum': false,
                    'total': 1,
                    'security': 2,
                    'returnAll': false
                };
                // Generate new address by options
                iota.api.getNewAddress(seed, options, function(error, newAddress){

                    if (error) {
                        config.debug && console.log(error);
                        return;
                    }
                    //use received data from getInputs and newAddress for transaction
                    var options = {
                        'inputs': inputsData.inputs,
                        'address' : newAddress[0],
                        'security': parseInt(2)
                    };
                    // Prepare trytes data
                    iota.api.prepareTransfers(seed, data, options, function (error, success) {
                        if (error) {
                            config.debug && console.log(error);
                            process.send({status: "error", result: error});
                        } else {
                            process.send({status: "success", result: success, keyIndex: inputsData.inputs[0].keyIndex, inputAddress:inputsData.inputs[0].address});
                        }
                    });
                });
            }
        });
    }
});