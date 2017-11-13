var env = process.env.NODE_ENV || 'development';
var config = require('../config')[env];

var IOTA = require('iota.lib.js');
// Create IOTA instance with host and port as provider
var iota = new IOTA({
    'host': config.iota.host,
    'port': config.iota.port
});
process.on('message', function(data) {
    //Set custom options for faster search by index
    var options = {
        'start': parseInt(data.keyIndex),
        'security': parseInt(2)
    };
    iota.api.getInputs(config.iota.seed, options, function(error, inputsData) {
        if (error) {
            process.send(error);
        } else {
            if(inputsData.totalBalance != undefined){
                process.send(inputsData);
            }
        }
    });
});