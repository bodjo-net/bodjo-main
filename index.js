require('colors');
require('./utils/utils.js');
require('./utils/logger.js');
var fs = require('fs');

var config = {};
try {
	config = JSON.parse(fs.readFileSync('./config.json').toString());
} catch (e) {
	err('error while trying to access to "' + 'config.json'.cyan + '"', e);
}

var db = require('./db.js')(config.db);
db('SELECT * FROM `bodjo-pages`')
	.then(console.dir)
	.catch(err);
// var router = require('./utils/router.js')({

// }, config.port, config.ssl);