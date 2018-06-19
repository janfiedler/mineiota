# mineiota
IOTA Faucet - Get IOTA through mining Monero

Live on: [https://mineiota.com](https://mineiota.com/)

test

##  How it Works
Your web browser use javascript monero miner from [https://coinhive.com](https://coinhive.com/).

Coinhive provide how much XMR for 1 000 000 hashes they pay. Than we take actual price BTC/XMR and BTC/IOTA is given actual ratio how much iota per 1 calculated hash of monero.

Your balance of monero hashes is save in coinhive database. So you cannot lose your reward. You can always request again. But if you make duplicity requests it is deleted from queue. Only one can be in queue.

Price is fixed in USD, so your reward can changing value of iota in time, until you make withdrawal request and get first in line.

### How make withdrawal
* Minimal payout is 1 iota. Please be sure you know price on exchanges is in MIOTA. It is 1 000 000 iota. So you can get reward in the smallest part of iota.
* In log you can see how you receiving rewards in iota valuated to usd price.
* Anytime you can click on update to get total iota in acutal prices ratio.
* If you ready get your reward, click on Withdraw. Now you will be added to queue. Now you can wait on your reward or continue to mining. When you come in line, you will receive all actual reward in this time.
* If for some reason you see your transaction is still panding after one day. Is possible, here is some error in iota tangle and transaction was skipped. In this case your reward is still on mineiota.com just
take your address, do login again and make new withdraw request.

## FEES
* Fee is set to 10% from coinhive.com profit. 
* Part from fee is send to donate address of current session on http://field.carriota.com/ for support all nodes operators.
* Part from fee is returned back to faucet for cover price volatility on market. Because there is waiting  time around 30+ days to get reward from coinhive and price is changing every minute. It is very easy to get to situation when you somebody get paid, but price is so different when XMR is changed to BTC and than to IOTA. This make losing funds. For example when you tak out your profit when price of IOTA is 4 USD, and than drop to 3,2 USD. And after that is made exchange from XMR to BTC to IOTA, this is 25% drop. So if fee is only 10% rest of 15% from all funds is gone. For long term functionality is necessary cover this moves.
* Part from fee is for cover cost of server, licences. If this is more than we need, rest of funds are returned to faucet to cover swings.
* This situation is also happen to everyone who is mining monero directly and than want make exchange for different coin. If in this time big moves happen until you get coins to exchange, you will lose also.
* Math ((((xmrBtc/(1/payoutPer1MHashes))/1000000)/(miotaBtc/1000000))/(100/70))*256) part of (100/90) representing fee.


## HOW FEE IS USED
* Maintenance services and developing.
* Donate address of http://field.carriota.com/ for support all nodes operators.
* For payouts all miners, only covering volatility market.

## Issues
If you have some issues, or ideas. Please be welcome uses tab Issues here on github. I try answer soon as posible


