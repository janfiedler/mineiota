// filedb.js
var fs = require('fs');
const folder = "filedb/";
// ========
module.exports = {
    read: function (table) {
        return JSON.parse(fs.readFileSync(folder+table+'.json', 'utf8'));
    },
    update: function (table, json) {
        fs.writeFileSync(folder+table+'.json', JSON.stringify(json), 'utf8');
    }
};