var express = require('express');
var router = express.Router();

/* About page. */
router.get('/', function(req, res, next) {
    res.render('about', { title: 'About | IOTA Faucet - Get IOTA through mining Monero' });
});

module.exports = router;
