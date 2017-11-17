// filedb.js
var fs = require('fs');
const folder = "filedb/";
// ========
module.exports = {
    select: function (table) {
        if (!fs.existsSync(folder+table+'.json')) {
            var tableDefault = "";
             switch(String(table)) {
                case "keyIndex":
                    tableDefault = '{"data":0}';
                    this.update(table, JSON.parse(tableDefault));
                    return JSON.parse(tableDefault);
                    break;
                case "cache":
                    tableDefault = '{"withdrawalInProgress":false,"isReattachable":null,"resetUserBalanceList":[],"trytes":[],"bundleHash":null}';
                    this.update(table, JSON.parse(tableDefault));
                    return JSON.parse(tableDefault);
                    break;
                case "queue":
                    tableDefault = '{"type":[],ids":[],"addresses":[]}';
                    this.update(table, JSON.parse(tableDefault));
                    return JSON.parse(tableDefault);
                    break;
                default:
                    tableDefault = '{"default":"Unknown table"}';
                    return JSON.parse(tableDefault);
            }
        } else {
            return JSON.parse(fs.readFileSync(folder+table+'.json', 'utf8'));
        }
    },
    update: function (table, json) {
        fs.writeFileSync(folder+table+'.json', JSON.stringify(json), 'utf8');
    }
};