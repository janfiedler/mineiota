var env = process.env.NODE_ENV || 'development';
var config = require('../config')[env];

var IOTA = require('iota.lib.js');
// Create IOTA instance with host and port as provider
var iota = new IOTA({
    'host': config.iota.host,
    'port': config.iota.port
});
process.on('message', function(transfer) {
    console.time('trytes-time');
    iota.api.prepareTransfers(config.iota.seed, transfer, function(error, success){
        if (error) {
            process.send({status:"error",result:error});
        } else {
            console.timeEnd('trytes-time');
            process.send({status:"success",result:success});
        }
    });
});