var env = process.env.NODE_ENV || 'development';
var config = require('../config')[env];

var IOTA = require('iota.lib.js');
// Create IOTA instance with host and port as provider
var iota = new IOTA({
    'host': config.iota.host,
    'port': config.iota.port
});
process.on('message', function(transfer) {
    iota.api.getInputs(config.iota.seed, function(error, inputsData) {
        if (error) {
            process.send(error);
        } else {
            var options = [{
                'inputs': inputsData.inputs,
                'address': config.iota.address,
                'security': parseInt(2)
            }];
            iota.api.prepareTransfers(config.iota.seed, transfer, options, function(error, success){
                if (error) {
                    process.send({status:"error",result:error});
                } else {
                    process.send({status:"success",result:success});
                }
            });
        }
    });

});