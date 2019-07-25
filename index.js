require('./utils/utils.js');
require('./utils/logger.js');

let config = readConfig();
requireKeys(config, ['db', 'port', 'images-dir', 'images-url'], 'config file');

let db = require('./db.js')(config.db);
require('./router.js')({
	account: require('./api/account.js')(db, config),
	pages: require('./api/pages.js')(db)
}, config.port, db, config.ssl);