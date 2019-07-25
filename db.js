const mysql = require('mysql');
global.escape = mysql.escape;

module.exports = function (credentials) {
	requireKeys(credentials, ['host', 'user', 'password', 'database'], 'database credentials');

	let connection = mysql.createConnection(credentials);
	connection.connect();
	connection.on('error', onError);
	connection.on('connect', onSuccess);

	function onError(e) {
		warnShort('[db] table connection error', e);
		warn('[db] will try to connect after 5 sec');
		setTimeout(function reconnect() {
			connection = mysql.createConnection(credentials);
			connection.connect();
			connection.on('error', onError);
			connection.on('connect', onSuccess);
		}, 5000);
	}
	function onSuccess() {
		log('[db]', 'successfully'.green.bold, 'connected');
	}

	return {
		end: connection.end.bind(connection),
		query: function (query) {
			query = query.replace(/[\r\n\t]+/g, '\n');
			return new Promise((resolve, reject) => {
				debug('[db]', 'SQL command query:', (query.includes('\n') ? '\n' + query.magenta.bold : '"' + query.magenta.bold + '"'));
				connection.query(query, function (error, results, fields) {
					if (error) {
						warn('[db]', 'SQL command query error:', error);
						reject(error);
						return;
					}

					resolve(results, fields);
				})
			})
		},
		insertQuery: function (table, element) {
			return `INSERT INTO \`${table}\` (${keys(element).map(x => `\`${x}\``).join(', ')})
					VALUES (${keys(element).map(k => typeof element[k] === 'number' ? (element[k]+'') : escape(element[k])).join(', ')});`;
		}
	}
}