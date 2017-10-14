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
    config.debug && console.time('balance-time');
    //Maybe use in future, when you have start from specific index for make it faster?
    var options = [{
        'start': 32,
        'security': 2
    }];
    iota.api.getInputs(config.iota.seed, function(error, inputsData) {
        if (error) {
            config.debug && console.log(error);
            process.send(error);
        } else {
            config.debug && console.timeEnd('balance-time');
            config.debug && console.log(inputsData);
            if(inputsData.totalBalance != undefined){
                process.send(inputsData.totalBalance);
            }
        }
    });
});