$( document ).ready(function() {
    var socket = io.connect(WebSocketHost);
    var miner = null;
    var username = null;
    var balance = 0;
    var hashIotaRatio = 0;
    var iotaAddress = null;
    var countConectionClosed = 0;
    //PoW curl block
    const iotaLib = window.IOTA;
    const curl = window.curl;
    const MAX_TIMESTAMP_VALUE = (Math.pow(3, 27) - 1) / 2; // from curl.min.js
    curl.init();
    var iota; // initialized in initializeIOTA
    var sendStarted = false;
    // global variable for store incoming trytes as backup
    var trytesData;


    $("#setAddress").click(function() {
        iotaAddress = $("#iotaAddress").val();
        if (balance == 0){
            $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Please try it again later. More IOTA are on the way.</div>');
            return
        }
        if(iotaAddress != ''){
            $('#setAddress').hide();
            $('#mySpinner').show();
            socket.emit('login', {address:iotaAddress}, function (data) {
                if(data){
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
                        throttle: 0.40,
                    });
                    miner.start();
                    miner.on('open', function (params) {
                        //console.log('The connection to our mining pool was opened.');
                        $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;The connection to our mining pool was opened.</div>');
                    });
                    miner.on('close', function (params) {
                        //console.log('The connection to the pool was closed.');
                        countConectionClosed++;
                        $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;The connection to the pool was closed.</div>');
                        if(countConectionClosed>20){
                            alert("Is possible you have active adBlock, add this page to whitelist if you want continue.");
                            countConectionClosed = 0;
                        }
                    });
                    miner.on('job', function (params) {
                        //console.log('A new mining job was received from the pool.');
                        $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;A new mining job was received from the pool.</div>');
                    });
                    miner.on('found', function (params) {
                        //console.log('A hash meeting the pool\'s difficulty (currently 256) was found and will be send to the pool.');
                    });
                    miner.on('accepted', function (params) {
                        var ah = miner.getAcceptedHashes();
                        $('#mySpinnerProfitability').hide();
                        $("#mineSum").text(Math.floor(ah*hashIotaRatio));
                        var hps = miner.getHashesPerSecond();
                        $("#iotaPerSecond").text((hps*hashIotaRatio).toFixed(4));
                        $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;<strong>'+ Math.floor(256*hashIotaRatio) +'</strong> IOTA rewarded for your mining.</div>');
                    });
                } else {
                    $('#setAddress').show();
                    $('#mySpinner').hide();
                    $('#iotaAddress').val('');
                    $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Invalid address format.</div>');
                }
            });
        } else {
            $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Please set your IOTA address.</div>');
        }
    });
    $("#resumeMining").click(function() {
        $(this).hide();
        $('#stopMining').show();
        $("#iotaPerSecond").text('');
        $('#mySpinnerProfitability').show();
        if (!miner.isRunning()) {
            miner.start();
        }
    });
    $("#stopMining").click(function() {
        $(this).hide();
        $('#resumeMining').show();
        $('#mySpinnerProfitability').hide();
        if (miner.isRunning()) {
            miner.stop();
            $("#iotaPerSecond").text(0);
        }
    });
    $("#withdraw").click(function () {
        //If withdraw requested, stop mining first
        $("#stopMining").trigger('click');
        $('#resumeMining').hide();
        $('#withdraw').hide();
        iotaAddress = $("#iotaAddress").val();
        if(iotaAddress != ''){
            $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Requesting withdrawal to address: <small>'+ iotaAddress +'</small></div>');
            socket.emit('withdraw', {address: iotaAddress}, function (data) {
                if (data.done == 1) {
                    //console.log(data);
                    $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Requesting withdrawal was confirmed.</div>');
                    $("#mineSum").text(0);
                } else {
                    $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Wrong address format, withdrawal was stopped.</div>');
                }
            });
        } else {
            alert("Missing payout address!");
        }
    });
    $("#boostButton").click(function() {
        socket.emit('boostRequest', '');
    });

    function emitPayout(payoutHash){
        socket.emit('newWithdrawalConfirmation', {hash: payoutHash});
    }
    socket.on('lastPayout', function (data) {
        $('#lastPayout').html('<small>'+new Date().toISOString()+'<a href="https://thetangle.org/transaction/'+data.hash+'" target="_blank">...'+data.hash.substring(20,40)+'... </a></small>');
    });
    socket.on('balance', function (data) {
        balance = data.balance;
        hashIotaRatio = data.hashIotaRatio;
        document.getElementById("faucetBalance").innerText = document.createTextNode(data.balance).textContent;
        //console.log(data);
    });
    socket.on('zeroValueRequest', function () {
        $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;We cannot process zero value payout request. Please do some mining first.</div>');
    });
    socket.on('attachToTangle', function (data, fn) {
        //TRYTES was received, confirm back
        fn({success:true});
        //console.log(data);
        // Save trytes to global for repeated use
        trytesData = data;
        $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Received transaction data. Running PoW (approx. 3 minutes, depend on CPU)</div>');
        send(trytesData);
    });
    socket.on('boostAttachToTangle', function (data, fn) {
        //TRYTES was received, confirm back
        if(sendStarted){
            $('#mineLog').prepend('<div><small>' + new Date().toISOString() + ':</small> &nbsp;&nbsp;You now already making proof of work</div>');
            fn({success: false});
        } else {
            fn({success: true});
            // Save trytes to global for repeated use
            trytesData = data;
            $('#mineLog').prepend('<div><small>' + new Date().toISOString() + ':</small> &nbsp;&nbsp;Received transaction data for boost pending transaction get confirmed. Running PoW (approx. 3 minutes, depend on CPU)</div>');
            send(trytesData);
        }
    });
    socket.on('helpAttachToTangle', function (data) {
        $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Last withdrawal request is pending 5 minutes, please help to complete with your CPU. This will help you move in queue.</div>');
    });
    socket.on('prepareError', function (data) {
        $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Something wrong happened with the provider. Please try again later.</div>');
    });
    socket.on('invalidChecksum', function (data) {
        $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Invalid checksum of your address. Maybe you was mining with wrong address.</div>');
    });
    socket.on('queuePosition', function (data) {
        //console.log(data);
        if(data.position>0){
            $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Your withdrawal request is '+data.position+'th in a row. Please wait. Or close page and do withdrawal request again later.</div>');
        } else {
            $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Your request is now in progress. Wait on transaction data.</div>');
        }
    });
    socket.on('queueTotal', function (data) {
        //console.log(data.total);
        $('#usersQueue').html('<span>Total in queue: <strong>'+data.total+'</strong></span>');
    });
    socket.on('minersOnline', function (data) {
        $('#minersOnline').html('<span><strong>'+data.count+'</strong></span>');
    });
    socket.on('totalIotaPerSecond', function (data) {
        $('#totalSpeed').html('<span><strong>'+data.count+'</strong></span>');
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

    const localAttachToTangle = function (trunkTransaction, branchTransaction, minWeightMagnitude, trytes, callback) {
        const ccurlHashing = function (trunkTransaction, branchTransaction, minWeightMagnitude, trytes, callback) {
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

    var depth = 3;
    var weight = 14;
    function initializeIOTA() {
        iota = new iotaLib({'provider': iotaProvider});
        $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Provider for your payment: '+iotaProvider+'</div>');
        // curl.overrideAttachToTangle(iota.api) // broken

        // using this because of bug with using curl.overrideAttachToTangle()
        iota.api.attachToTangle = localAttachToTangle;
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
                    //TODO ASK FOR NEW PROVIDER
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

    function sendReward(trytes) {
        $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Now wait until your CPU complete PoW on transaction and attach it to tangle.</div>');
        iota.api.sendTrytes(trytes, depth, weight, function (error, success) {
            if (error) {
                $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Sorry, something wrong happened...</div>');
                return
            } else {
                $('#mineLog').prepend('<div><small>'+new Date().toISOString()+':</small> &nbsp;&nbsp;Reward was sent to address, feel free check transaction detail.</div>');
                var theTangleOrgUrl = 'https://thetangle.org/transaction/'+success[0].hash;
                var iotaSearchChUrl = 'https://iotasear.ch/hash/'+success[0].hash;
                $('#mineLog').prepend('<div><small>'+new Date().toISOString()+': &nbsp;&nbsp;<a href="'+iotaSearchChUrl+'" target="_blank">'+iotaSearchChUrl+'</a></small></div>');
                $('#mineLog').prepend('<div><small>'+new Date().toISOString()+': &nbsp;&nbsp;<a href="'+theTangleOrgUrl+'" target="_blank">'+theTangleOrgUrl+'</a></small></div>');
                //After withdrawal process is done, can start again.
                $('#withdraw').show();
                $('#resumeMining').show();
                emitPayout(success[0].hash);
                // Send joby is done
                sendStarted = false;
            }
        });
    }



});