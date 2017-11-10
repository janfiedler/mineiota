var env = process.env.NODE_ENV || 'development';
var config = require('../config')[env];

var IOTA = require('iota.lib.js');
// Create IOTA instance with host and port as provider
var iota = new IOTA({
    'host': config.iota.host,
    'port': config.iota.port
});
process.on('message', function(data) {

    iota.api.sendTrytes(data.trytes, 3, 14, function(error, success) {
        if (error) {
            process.send({error:error});
        } else {
            process.send(success);
        }
    });

});