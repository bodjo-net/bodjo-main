module.exports = function (credentials) {
	if (!contain(keys(credentials), ['host','user','password','database'])) {
		err('DB: credentials should contain: host, user, password, database.');
		return null;
	}

	let mysql = require('mysql');
	let connection = mysql.createConnection(credentials);

	connection.connect();

	return function (query) {
		return new Promise((resolve, reject) => {
			connection.query(query, function (error, results, fields) {
				if (error) {
					reject(error);
					return;
				}

				resolve(results, fields);
			});
		});
	}
}