var config = {
    development: {
        debug: true,
        port: 3000,
        url: 'http://127.0.0.1',
        outputsInTransaction: 10,
        // Address where to send rest of funds if balance is lower for next payment
        remainingBalanceAddress: '',
        // IOTA Provider details
        iota: {
            host:   'https://yournode.com',
            port:   '14265',
            seed:   'YOUR99SEED',
            keyIndexStart: 0 // Number where is your keyIndex in seed addresses
        },
        // https://coinhive.com details
        coinhive: {
            //Public key is send to users for identify your pool
            publicKey: 'coinHivePublicKeyHere',
            //Private key is used for http api, get info about mining
            privateKey: 'coinHIvePrivateKeyHere',
            // How much percent for client reward
            feeRatio: 10
        },
        WebSocket: {
            listenPort:   '3003',
            port:   '3003'
        }
    },
    production: {
        debug: false,
        port: 3000,
        url: 'https://yourwebsite.com',
        outputsInTransaction: 10,
        // Address where to send rest of funds if balance is lower for next payment
        remainingBalanceAddress: '',
        // IOTA Provider details
        iota: {
            host:   'https://yournode.com',
            port:   '14265',
            seed:   'YOUR99SEED',
            keyIndexStart: 30 // Number where is your keyIndex in seed addresses
        },
        // https://coinhive.com details
        coinhive: {
            //Public key is send to users for identify your pool
            publicKey: 'coinHivePublicKeyHere',
            //Private key is used for http api, get info about mining
            privateKey: 'coinHIvePrivateKeyHere',
            // How much percent for client reward
            feeRatio: 90
        },
        WebSocket: {
            listenPort:   '3033',
            port:   '3003'
        }
    }
};
module.exports = config;