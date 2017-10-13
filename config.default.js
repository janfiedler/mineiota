var config = {
    development: {
        debug: true,
        url: 'http://yourwebsite.com',
        // IOTA Provider details
        iota: {
            host:   'http://127.0.0.1',
            port:   '14265',
            seed:   'YOUR99SEED'
        },
        // https://coinhive.com details
        coinhive: {
            //Public key is send to users for identify your pool
            publicKey: 'coinHivePublicKeyHere',
            //Private key is used for http api, get info about mining
            privateKey: 'coinHIvePrivateKeyHere',
            // How much percent take for final client reward
            feeRatio: 10
        }
    },
    production: {
        debug: false,
        url: 'https://yourwebsite.com',
        // IOTA Provider details
        iota: {
            host:   'https://yournode.com',
            port:   '14265',
            seed:   'YOUR99SEED'
        },
        // https://coinhive.com details
        coinhive: {
            //Public key is send to users for identify your pool
            publicKey: 'coinHivePublicKeyHere',
            //Private key is used for http api, get info about mining
            privateKey: 'coinHIvePrivateKeyHere',
            // How much percent take for final client reward
            feeRatio: 10
        }
    }
};
module.exports = config;