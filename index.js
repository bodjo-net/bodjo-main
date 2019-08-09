require('./utils/utils.js');
require('./utils/logger.js');

console.log(`  __                    __       ${"__".magenta.bold}\n /\\ \\                  /\\ \\     ${"/\\_\\".magenta.bold}\n \\ \\ \\____   ______   _\\_\\ \\    ${"\\/_/".magenta.bold}_   ______\n  \\ \\  __ \\ /\\  __ \\ /\\  __ \\   __/\\ \\ /\\  __ \\\n   \\ \\ \\_\\ \\\\ \\ \\_\\ \\\\ \\ \\_\\ \\ /\\ \\_\\ \\\\ \\ \\_\\ \\\n    \\ \\_____\\\\ \\_____\\\\ \\_____\\\\ \\_____\\\\ \\_____\\\n     \\/_____/ \\/_____/ \\/_____/ \\/_____/ \\/_____/\n`);

let config = readConfig();
requireKeys(config, ['db', 'port', 'images-dir', 'images-url'], 'config file');

let db = require('./db.js')(config.db);
require('./router.js')({
	account: require('./api/account.js')(db, config),
	pages: require('./api/pages.js')(db),
	code: require('./api/code.js')(db),
	games: require('./api/games.js')(db)
}, config.port, db, config.ssl);