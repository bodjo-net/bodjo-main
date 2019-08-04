const net = require('net');

module.exports = (db) => {
	let tokens = {};
	let servers = {};


	return 
	({
		info: m({
			token: "optional;string;token"
		}, async function (p) {
			
		}),
		join: m({
			name: 'require;string;strict',
			token: 'require;string;token'
		}, async function (p) {
			if (!servers[p.name])
				return errObj(1, 'game server is not found');

			if (!servers[p.name].status)
				return errObj(2, 'game server is not working right now');

			if (!tokens[p.name])
				tokens[p.name] = {};
			if (!tokens[p.name][p.token.username])
				tokens[p.name][p.token.username] = randomString(32);
			let token = tokens[p.name][p.token.username];
			servers[p.name].addPlayer(p.token.username, token);

			return okObj({
				host: servers[p.name].host,
				username: p.token.username,
				gameSessionToken: token
			});
		})

	});
}