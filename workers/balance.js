var env = process.env.NODE_ENV || 'development';
var config = require('../config')[env];

var IOTA = require('iota.lib.js');
// Create IOTA instance with host and port as provider
var iota = new IOTA({
    'host': config.iota.host,
    'port': config.iota.port
});
process.on('message', function(m) {
    //Maybe use in future, when you have start from specific index for make it faster?
    var options = [{
        'start': parseInt(89),
        'end': parseInt(89),
        'security': parseInt(2),
        'threshold': parseInt(52)
    }];
    iota.api.getInputs(config.iota.seed, function(error, inputsData) {
        if (error) {
            process.send(error);
        } else {
            if(inputsData.totalBalance != undefined){
                process.send(inputsData);
            }
        }
    });
});