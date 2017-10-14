var env = process.env.NODE_ENV || 'development';
var config = require('../config')[env];

var IOTA = require('iota.lib.js');
// Create IOTA instance with host and port as provider
var iota = new IOTA({
    'host': config.iota.host,
    'port': config.iota.port
});
process.on('message', function(m) {
    config.debug && console.log("Balance worker started");
    iota.api.getAccountData(config.iota.seed, function(error, accountData) {
        if (error) {
            config.debug && console.log("Error worker balance");
            config.debug && console.log(error);
            process.send(error);
        } else {
            config.debug && console.log("Success worker balance");
            config.debug && console.log(accountData);
            if(accountData.balance != undefined){
                process.send(accountData.balance);
            }
        }
    })
});