$( document ).ready(function() {
    var socket = io();
    var miner = null;
    var minerSetup = null;
    var username = null;
    var balance = 0;
    var hashIotaRatio = 0;
    var iotaUSD = 0;
    var iotaAddress = null;
    var getValueProgress = 0;

    var iota; // initialized in initializeIOTA
    var sendStarted = false;
    // global variable for store incoming trytes as backup
    var trytesData;

    const tangleAddressExplorers = [
        {
            name: 'iotasear.ch',
            urlAddress: 'https://iotasear.ch/address/'
        },
        {
            name: 'thetangle.org',
            urlAddress: 'https://thetangle.org/address/'
        },
        {
            name: 'open-iota.prizziota.com',
            urlAddress: 'http://open-iota.prizziota.com/#/search/address/'
        }
    ]
    const tangleBundleExplorers = [
        {
            name: 'iotasear.ch',
            urlAddress: 'https://iotasear.ch/bundle/'
        },
        {
            name: 'thetangle.org',
            urlAddress: 'https://thetangle.org/bundle/'
        },
        {
            name: 'open-iota.prizziota.com',
            urlAddress: 'http://open-iota.prizziota.com/#/search/bundle/'
        }
    ]

    var MinerUI = function(miner, elements) {
        this.miner = miner;
        this.miner._stopOnInvalidOptIn = true;

        this.elements = elements;

        this.elements.threadsAdd.addEventListener('click', this.addThread.bind(this));
        this.elements.threadsRemove.addEventListener('click', this.removeThread.bind(this));

        this.elements.speedUp.addEventListener('click', this.speedUp.bind(this));
        this.elements.speedDown.addEventListener('click', this.speedDown.bind(this));

        this.elements.threads.textContent = this.miner.getNumThreads();
        this.elements.speed.textContent = Math.round((1-this.miner.getThrottle()) * 100) + '%';
    };

    MinerUI.prototype.start = function(ev) {
        if (ev) {
            ev.preventDefault();
        }
        this.miner.start();
        this.elements.threads.textContent = this.miner.getNumThreads();
        this.elements.speed.textContent = Math.round((1-this.miner.getThrottle()) * 100) + '%';
    };

    MinerUI.prototype.stop = function() {
        this.miner.stop();
    };

    MinerUI.prototype.addThread = function(ev) {
        this.miner.setNumThreads(this.miner.getNumThreads() + 1);
        this.elements.threads.textContent = this.miner.getNumThreads();
        this.storeDefaults();

        ev.preventDefault();
        return false;
    };

    MinerUI.prototype.removeThread = function(ev) {
        this.miner.setNumThreads(Math.max(0, this.miner.getNumThreads() - 1));
        this.elements.threads.textContent = this.miner.getNumThreads();
        this.storeDefaults();

        ev.preventDefault();
        return false;
    };

    MinerUI.prototype.speedUp = function(ev) {
        var throttle = this.miner.getThrottle();
        throttle = Math.max(0, throttle - 0.1);
        this.miner.setThrottle(throttle);

        this.elements.speed.textContent = Math.round((1-throttle) * 100) + '%';
        this.storeDefaults();

        ev.preventDefault();
    };

    MinerUI.prototype.speedDown = function(ev) {
        var throttle = this.miner.getThrottle();
        throttle = Math.min(0.9, throttle + 0.1);
        this.miner.setThrottle(throttle);

        this.elements.speed.textContent = Math.round((1-throttle) * 100) + '%';
        this.storeDefaults();

        ev.preventDefault();
    };

    MinerUI.prototype.storeDefaults = function() {
        if (!window.parent) {
            return;
        }
        window.parent.postMessage({type: 'coinhive-store-defaults', params: {
            throttle: this.miner.getThrottle(),
            threads: this.miner.getNumThreads()
        }}, "*");
    };

    function getURLParameter(name) {
        return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(location.search) || [null, ''])[1].replace(/\+/g, '%20')) || null;
    }

    var getAddress = getURLParameter('address');
    var getTag = getURLParameter('tag');
    var getValue = getURLParameter('value');

    var getExternal = getURLParameter('external');
    if(getExternal !== null) {
        $('#boostZone').show();
        socket.emit('externalComputeLogin', {password:getExternal}, function (data) {
            if (data.done == 1) {
                console.log("Authorized");
            } else {
                console.log("Unauthorized");
            }
        });
    }

    if(getAddress !== null){
        if(getTag !== null && getValue !== null){
            if(getTag.length <= 27){
                $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;You start mining '+getValue+' IOTA for custom payout request!</div>');
                // Start loop for check minimal payout
                var minPayoutInterval = setInterval(function () {
                    if(parseFloat(getValueProgress) > parseInt(getValue)){
                        $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp; Mining progress completed: '+getValueProgress+'/'+getValue+' IOTA</div>');
                        stopMining();
                        withdraw();
                        clearInterval(minPayoutInterval);
                    } else {
                        $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp; Mining progress: '+getValueProgress+'/'+getValue+' IOTA</div>');
                    }
                }, 10000);

                $("#iotaAddress").val(getAddress);
                //Start mine
                setTimeout(function(){
                    login();
                }, 2000);
            } else {
                $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Max lenght of tag is 27 trytes!</div>');
            }
        } else {
            // If only address is in url parameter, parse and do login
            $("#iotaAddress").val(getAddress);
            setTimeout(function(){
                login();
            }, 2000);
        }
    }

    function getUserActualBalance(){
        socket.emit('getUserActualBalance', {address: iotaAddress}, function (data) {
            //console.log(data);
            if (data.done == 1) {
                $("#mineSum").html("Unpaid reward: " +data.balance + " IOTA <small>($"+ (data.balance*iotaUSD).toFixed(10)+" USD)</small>");
                $("#dateSum").html('<small>'+new Date().toISOString()+': (refresh every 10 seconds)</small>');
            } else {
                $("#mineSum").text(0);
            }
        });
    }
    function login(){
        iotaAddress = $("#iotaAddress").val();
        if (balance == 0){
            $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Please try it again later. More IOTA are on the way.</div>');
            return
        }
        if(iotaAddress != ''){
            $('#setAddress').hide();
            $('#mySpinner').show();
            socket.emit('login', {address:iotaAddress}, function (data) {
                if (data.done === -1) {
                    showAddresAttachTutorial();
                    $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Failed! Your address is not attached and confirmed to tangle!</div>');
                    // Hide spinner, user is accepted
                    $('#mySpinner').hide();
                    $('#setAddress').show();
                    $('#iotaAddress').val('');
                } else if (data.done === 0) {
                    console.log("Warning! Your address is attached, but not confirmed to tangle!");
                    startMining();
                } else if(data.done === 1){
                    startMining();
                } else {
                    $('#setAddress').show();
                    $('#mySpinner').hide();
                    $('#iotaAddress').val('');
                    $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Invalid address format.</div>');
                }
                function startMining(){
                    // Hide button for setting address
                    $('#setAddress').hide();
                    // Hide spinner, user is accepted
                    $('#mySpinner').hide();
                    // Disable input field, for fixing address
                    $('#iotaAddress').prop('disabled', true);
                    // Show status of mining
                    $("#mineStats").show();
                    // Set miner and start mining with 60% CPU power
                    username = data.username;
                    miner = new CoinHive.User(data.publicKey, username, {
                        autoThreads: true,
                        throttle: 0.40
                    });

                    // Create UI
                    minerSetup = new MinerUI(miner, {
                        threads: document.getElementById('threads'),
                        threadsAdd: document.getElementById('threads-add'),
                        threadsRemove: document.getElementById('threads-remove'),
                        speed: document.getElementById('speed'),
                        speedUp: document.getElementById('speed-up'),
                        speedDown: document.getElementById('speed-down'),
                    });
                    minerSetup.start();

                    miner.on('open', function (params) {
                        $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;The connection to our mining pool was opened.</div>');
                        getUserActualBalance();
                        setInterval(function () {
                            getUserActualBalance();
                        }, 10000);
                    });
                    miner.on('close', function (params) {
                        $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;The connection to the pool was closed.</div>');
                    });
                    miner.on('job', function (params) {
                        $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;A new mining job was received from the pool.</div>');
                    });
                    miner.on('found', function (params) {
                        //console.log('A hash meeting the pool\'s difficulty (currently 256) was found and will be send to the pool.');
                    });
                    miner.on('accepted', function (params) {
                        var ah = miner.getAcceptedHashes();
                        $('#mySpinnerProfitability').hide();
                        var hps = miner.getHashesPerSecond();
                        $("#iotaPerSecond").text((hps*hashIotaRatio).toFixed(4));
                        var iotaReward = (256*hashIotaRatio);
                        var usdReward = iotaReward * iotaUSD;
                        getValueProgress = (parseFloat(getValueProgress.toFixed(2))+parseFloat(iotaReward.toFixed(2)));
                        $('#mineLog').prepend('<div><small>'+new Date().toISOString()+': 256 XMR hash mined and accepted.</small> Your reward: <strong>'+ iotaReward.toFixed(10) +'</strong> IOTA <small>($'+usdReward.toFixed(10)+' USD)</small></div>');
                        // Delete more than 10 log history
                        var mineLogSize = $("#mineLog div").length;
                        if(parseInt(mineLogSize) > 10){
                            for (i=0; i < (parseInt(mineLogSize)-10); i++ ){
                                $('#mineLog').find('div:last').remove();
                            }
                        }
                    });
                }
            });
            setTimeout(function(){
                if (typeof CoinHive === 'undefined') {
                    alert("Is possible you have active adBlock, add this page to whitelist if you want continue.");
                }
            }, 5000);


        } else {
            $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Please set your IOTA address.</div>');
        }
    }
    $("#setAddress").click(function() {
        login();
    });
    $("#resumeMining").click(function() {
        $(this).hide();
        $('#stopMining').show();
        $("#iotaPerSecond").text('');
        $('#mySpinnerProfitability').show();
        if (!miner.isRunning()) {
            minerSetup.start();
        }
    });
    function stopMining(){
        $("#stopMining").hide();
        $('#resumeMining').show();
        $('#mySpinnerProfitability').hide();
        if (miner.isRunning()) {
            minerSetup.stop();
            $("#iotaPerSecond").text(0);
        }
    }
    $("#stopMining").click(function() {
        stopMining();
    });
    function withdraw(){
        iotaAddress = $("#iotaAddress").val();
        if(iotaAddress != ''){
            $("#withdraw").hide();
            const tangleExplorerAddressLinks = tangleAddressExplorers.map(function (tangleExplorer) {
                return "<a href=\'" + tangleExplorer.urlAddress + iotaAddress + "' target='_blank'>" + tangleExplorer.name + "</a>";
            }).join(' – ');
            $('#mineLog').prepend('<div><small>' + new Date().toISOString() + '</small> &nbsp;&nbsp;Requesting withdrawal to address: <small>' + tangleExplorerAddressLinks + '</small>');
            socket.emit('withdraw', {address: iotaAddress, tag: getTag, value: getValueProgress}, function (data) {
                if (data.done == 1) {
                    $('#mineLog').prepend('<div><small>' + new Date().toISOString() + ':</small> &nbsp;&nbsp;Requesting withdrawal was confirmed.</div>');
                } else if (data.done === -1) {
                    $('#mineLog').prepend('<div><small>' + new Date().toISOString() + ':</small> &nbsp;&nbsp;You are already in withdrawal queue. Position: ' + data.position + '</div>');
                } else if (data.done === 0) {
                    showAddresAttachTutorial();
                    $('#mineLog').prepend('<div><small>' + new Date().toISOString() + ':</small> &nbsp;&nbsp;Address is not attached to tangle. or bad address format!</div>');
                }
            });
        } else {
            alert("Missing payout address!");
        }
    }
    $("#withdraw").click(function () {
        withdraw();
    });
    $("#boostButton").click(function() {
        socket.emit('boostRequest', '');
    });

    function showAddresAttachTutorial(){
        $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;<img src="/images/how_attach_address.png"></div>');
        $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Be sure, you did those steps: </div>');
    }

    function emitPayout(bundle){
        socket.emit('newWithdrawalConfirmation', {bundle: bundle});
    }

    socket.on('globalValues', function (data) {
        if(typeof data.hashIotaRatio !== 'undefined'){
            hashIotaRatio = data.hashIotaRatio;
        }
        if(typeof data.iotaUSD !== 'undefined'){
            iotaUSD = data.iotaUSD;
        }
        if(typeof data.balance !== 'undefined'){
            balance = data.balance;
            document.getElementById("faucetBalance").innerText = document.createTextNode(balance).textContent;
        }
        if(typeof data.count !== 'undefined'){
            $('#minersOnline').html('<span>miners online: <strong>'+data.count+'</strong></span>');
        }
        if(typeof data.bundle !== 'undefined'){
            const tangleExplorerBundleLinks = tangleBundleExplorers.map(function(tangleExplorer) {
                return "<a href=\'"+tangleExplorer.urlAddress+data.bundle+"' target='_blank'>"+tangleExplorer.name+"</a>";
            }).join(' – ');
            $('#lastPayout').html('<small>'+new Date().toISOString()+' '+tangleExplorerBundleLinks+'</small>');
        }
        if(typeof data.totalIotaPerSecond !== 'undefined' && data.totalIotaPerSecond > 0){
            $('#totalSpeed').html('<span>total speed: <strong>'+data.totalIotaPerSecond+'</strong> iota/s</span>');
        }
        if(typeof data.confirmedSpams !== 'undefined' && data.confirmedSpams > 0){
            $('#confirmedSpams').html('<span data-toggle="tooltip" data-placement="left" title="Confirmed transactions by spamming network from last restart">Spamming: <strong>'+data.confirmedSpams+'</strong></span>');
        }
        //console.log(data);
    });
    socket.on('boostAttachToTangle', function (data) {
        //TRYTES was received, confirm back
        if(sendStarted){
            $('#mineLog').prepend('<div><small>' + new Date().toISOString() + ':</small> &nbsp;&nbsp;You now already making proof of work</div>');
        } else {
            // Save trytes to global for repeated use
            trytesData = data;
            $('#mineLog').prepend('<div><small>' + new Date().toISOString() + ':</small> &nbsp;&nbsp;Received transaction data for boost pending transaction get confirmed. Starting proof of work.</div>');
            send(trytesData);
        }
    });
    socket.on('queuePosition', function (data) {
        //console.log(data);
        if(data.position>0){
            var positionSuffix;
            switch(data.position) {
                case 1:
                    positionSuffix = "st";
                    break;
                case 2:
                    positionSuffix = "nd";
                    break;
                case 3:
                    positionSuffix = "rd";
                    break;
                default:
                    positionSuffix = "th";
            }
            $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Your withdrawal request is '+data.position+positionSuffix+' in the queue. You can close page now.</div>');
        } else {
            $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Your request is now in progress. Wait on confirmation link in right top corner.</div>');
            setTimeout(function(){
                // Wait 5 sec before show withdraw button again.
                $('#withdraw').show();
            }, 5000);
            $('#withdraw').show();
        }
    });
    socket.on('queueTotal', function (data) {
        //console.log(data.total);
        $('#usersQueue').html('<span>unpaid in queue: <strong>'+data.total+'</strong></span>');
    });
    socket.on('announcement', function (data) {
        $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;'+data+'</div>');
    });

// PoW curl block
// adapted from https://github.com/iotaledger/wallet/blob/master/ui/js/iota.lightwallet.js

    function send(trytes){
        if(sendStarted) { return }
        sendStarted = true;
        initializeIOTA();
        checkIfNodeIsSynced(trytes);
    }

    var depth = 3;
    var weight = 14;
    function initializeIOTA() {
        const iotaLib = window.IOTA;
        iota = new iotaLib({'provider': iotaProvider});
        $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Provider for your transaction: '+iotaProvider+'</div>');
        // curl.overrideAttachToTangle(iota.api) // broken

        // using this because of bug with using curl.overrideAttachToTangle()
        iota.api.attachToTangle = localAttachToTangle;
    }

    function sendReward(trytes) {
        $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Now wait until your GPU complete PoW on transaction and attach it to tangle.</div>');
        iota.api.sendTrytes(trytes, depth, weight, function (error, success) {
            if (error) {
                $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Sorry, something wrong happened...</div>');
                console.log(error);
                sendReward(trytes);
            } else {
                // Delete more than 20 log history
                var mineLogSize = $("#mineLog div").length;
                if(parseInt(mineLogSize) > 20){
                    for (i=0; i < (parseInt(mineLogSize)-20); i++ ){
                        $('#mineLog').find('div:last').remove();
                    }
                }
                $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Reward was sent to address, feel free check transaction detail.</div>');
                var theTangleOrgUrl = 'https://thetangle.org/bundle/'+success[0].bundle;
                $('#mineLog').prepend('<div><small>'+new Date().toISOString()+': &nbsp;&nbsp;<a href="'+theTangleOrgUrl+'" target="_blank">'+theTangleOrgUrl+'</a></small></div>');
                //After withdrawal process is done, can start again.
                $('#resumeMining').show();
                emitPayout(success[0].bundle);
                // Send joby is done
                sendStarted = false;
            }
        });
    }

    function checkIfNodeIsSynced(trytes) {
        //console.log("Checking if node is synced");
        $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Checking if node is synced.</div>');

        iota.api.getNodeInfo(function(error, success){
            if(error) {
                //console.log("Error occurred while checking if node is synced");
                $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Error occurred while checking if node is synced.</div>');
                //Change node and try it again
                setTimeout(function(){
                    //After timeout try again
                    checkIfNodeIsSynced(trytes);
                }, 5000);
                return
            }

            const isNodeUnsynced =
                success.latestSolidSubtangleMilestoneIndex < success.latestMilestoneIndex;

            const isNodeSynced = !isNodeUnsynced;

            if(isNodeSynced) {
                //console.log("Node is synced");
                $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Node is synced.</div>');
                sendReward(trytes);
            } else {
                //console.log("Node is not synced.");
                //Change node and try it again
                setTimeout(function(){
                    //TODO ASK FOR NEW PROVIDER
                    //After timeout try again
                    checkIfNodeIsSynced(trytes);
                }, 1000);
                $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Node is not synced.</div>');
            }
        })
    }

    const localAttachToTangle = function (trunkTransaction, branchTransaction, minWeightMagnitude, trytes, callback) {
        const ccurlHashing = function (trunkTransaction, branchTransaction, minWeightMagnitude, trytes, callback) {

            //PoW curl block
            const curl = window.curl;
            const MAX_TIMESTAMP_VALUE = (Math.pow(3, 27) - 1) / 2; // from curl.min.js
            curl.init();

            const iotaObj = iota;

            // inputValidator: Check if correct hash
            if (!iotaObj.valid.isHash(trunkTransaction)) {
                return callback(new Error("Invalid trunkTransaction"));
            }

            // inputValidator: Check if correct hash
            if (!iotaObj.valid.isHash(branchTransaction)) {
                return callback(new Error("Invalid branchTransaction"));
            }

            // inputValidator: Check if int
            if (!iotaObj.valid.isValue(minWeightMagnitude)) {
                return callback(new Error("Invalid minWeightMagnitude"));
            }

            var finalBundleTrytes = [];
            var previousTxHash;
            var i = 0;

            function loopTrytes() {
                getBundleTrytes(trytes[i], function (error) {
                    if (error) {
                        return callback(error);
                    } else {
                        i++;
                        if (i < trytes.length) {
                            loopTrytes();
                        } else {
                            // reverse the order so that it's ascending from currentIndex
                            return callback(null, finalBundleTrytes.reverse());
                        }
                    }
                });
            }

            function getBundleTrytes(thisTrytes, callback) {
                // PROCESS LOGIC:
                // Start with last index transaction
                // Assign it the trunk / branch which the user has supplied
                // IF there is a bundle, chain  the bundle transactions via
                // trunkTransaction together

                var txObject = iotaObj.utils.transactionObject(thisTrytes);
                txObject.tag = txObject.obsoleteTag;
                txObject.attachmentTimestamp = Date.now();
                txObject.attachmentTimestampLowerBound = 0;
                txObject.attachmentTimestampUpperBound = MAX_TIMESTAMP_VALUE;
                // If this is the first transaction, to be processed
                // Make sure that it's the last in the bundle and then
                // assign it the supplied trunk and branch transactions
                if (!previousTxHash) {
                    // Check if last transaction in the bundle
                    if (txObject.lastIndex !== txObject.currentIndex) {
                        return callback(new Error("Wrong bundle order. The bundle should be ordered in descending order from currentIndex"));
                    }

                    txObject.trunkTransaction = trunkTransaction;
                    txObject.branchTransaction = branchTransaction;
                } else {
                    // Chain the bundle together via the trunkTransaction (previous tx in the bundle)
                    // Assign the supplied trunkTransaciton as branchTransaction
                    txObject.trunkTransaction = previousTxHash;
                    txObject.branchTransaction = trunkTransaction;
                }

                var newTrytes = iotaObj.utils.transactionTrytes(txObject);

                curl.pow({trytes: newTrytes, minWeight: minWeightMagnitude}).then(function (nonce) {
                    var returnedTrytes = newTrytes.substr(0, 2673 - 81).concat(nonce);
                    var newTxObject = iotaObj.utils.transactionObject(returnedTrytes);

                    // Assign the previousTxHash to this tx
                    var txHash = newTxObject.hash;
                    previousTxHash = txHash;

                    finalBundleTrytes.push(returnedTrytes);
                    callback(null);
                }).catch(callback);
            }

            loopTrytes()
        };

        ccurlHashing(trunkTransaction, branchTransaction, minWeightMagnitude, trytes, function (error, success) {
            if (error) {
                //console.log(error);
            } else {
                //console.log(success);
            }
            if (callback) {
                return callback(error, success);
            } else {
                return success;
            }
        })
    };

});