const net = require('net');

var prefix = '[games]';

let tokens = {};
let servers = {};

module.exports = (db) => {
	start(db);
	const permissions = require('./../utils/permissions.js')(db);

	return {
		info: m({
			token: "optional;string;token",
			advanced: "optional;boolean;default=false"
		}, async function (p) {
			let perms = !p.token ? {} : await permissions.load(db, p.token);
			if (p.advanced && !perms.all && !perms.games)
				return errObj(1, 'access denied');

			if (p.advanced) {
				let result = [];
				for (let servername in servers) {
					if (perms.all || perms.games === 'all' ||
						(Array.isArray(perms.games) && perms.games.includes(servername))) {
						result.push(servers[servername].advancedInfo());
					}
				}
				return okObj({servers: result});
			} else {
				let result = [];
				for (let servername in servers) {
					if (servers[servername].status)
						result.push(servers[servername].info());
				}
				return okObj({servers: result});
			}
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
		}),

		new: m({
			token: 'require;string;token',
			name: 'require;string',
			game: 'require;string',
			host: 'require;string'
		}, async function (p) {
			if (!(await permissions.can(p.token, 'games/new', p)))
				return errObj(1, 'access denied');

			if (servers[p.name])
				return errObj(2, 'game server has been already added');

			let secret = randomString(64);
			let serverInfo = {
				name: p.name,
				game: p.game,
				host: p.host,
				secret
			}
			await db.query(db.insertQuery('bodjo-games', serverInfo));
			servers[p.name] = new GameServer(serverInfo);

			return okObj({secret});
		}),
		edit: m({
			token: 'require;string;token',
			name: 'require;string',
			game: 'optional;string',
			host: 'optional;string'
		}, async function (p) {
			if (!(await permissions.can(p.token, 'games/edit', p)))
				return errObj(1, 'access denied');
			if (!servers[p.name])
				return errObj(2, 'server is not found');

			let newServerInfo = {};
			if (typeof p.game === 'string')
				newServerInfo.game = p.game;
			if (typeof p.host === 'string')
				newServerInfo.host = p.host;

			await db.query(`UPDATE \`bodjo-games\`
							SET ${keys(newServerInfo).map(k => '\`'+k+'\` = ' + escape(newServerInfo[k])).join(', ')}
							WHERE \`name\`=${escape(p.name)}`);
			if (servers[p.name].status) {
				if (typeof p.game === 'string')
					servers[p.name].game = p.game;
				if (typeof p.host === 'string')
					servers[p.name].host = p.host;
			} else {
				let info = servers[p.name].advancedInfo();
				if (typeof p.game === 'string')
					info.game = p.game;
				if (typeof p.host === 'string')
					info.host = p.host;

				servers[p.name].working = false;
				delete servers[p.name];
				servers[p.name] = new GameServer(info);
			}
			return okObj();
		})
	};
}

async function start(db) {
	let serversInfo = await db.query(`SELECT * FROM \`bodjo-games\``);
	for (let serverInfo of serversInfo)
		servers[serverInfo.name] = new GameServer(serverInfo);
}

class GameServer {
	constructor(info) {
		this.status = false;
		this.working = true;

		this.game = info.game;
		this.name = info.name;
		this.host = info.host;
		this.secret = info.secret;
		this.__connected = false;
		this.__toSend = [];
		this.socket = null;

		this.connect();
	}

	info() {
		return {
			name: this.name,
			game: this.game,
			host: this.host,
			status: this.status
		}
	}
	advancedInfo() {
		return {
			name: this.name,
			game: this.game,
			host: this.host,
			secret: this.secret,
			status: this.status
		}
	}

	connect() {
		let server = this;
		if (!server.working)
			return;

		let sIndex = this.host.lastIndexOf(':');
		let port = sIndex >= 0 ? this.host.substring(sIndex+1) : 3221;
		let host = sIndex >= 0 ? this.host.substring(0, sIndex) : this.host;

		server.status = false;
		this.socket = new net.Socket();
		log(prefix, 'attempting to connect to', server.name.cyan.bold, ('('+host+':'+port+')').grey);
		this.socket.connect(port, host, function () {
			log(prefix, 'connected to', server.name.cyan.bold);
			server.socket.write(JSON.stringify({
				type: 'connect', 
				name: server.name,
				secret: server.secret
			}));
		});
		this.socket.on('data', function onMessage(message) {
			if (message instanceof Buffer)
				message = message.toString();
			if (typeof message !== 'string')
				return;

			let object;
			try {
				object = JSON.parse(message);
			} catch (e) {return; }

			if (object.type === 'connect') {
				if (object.status === 'ok') {
					server.status = true;
					log(prefix, server.name.cyan.bold + ' authorized ' + 'successfully'.green.bold);

					if (server.__toSend.length > 0) {
						for (let message of server.__toSend)
							server.socket.write(message);
						server.__toSend = [];
					}
				} else {
					server.status = false;
					warn(prefix, server.name.cyan.bold, 'authorization error');
					server.socket.destroy();
				}
			}
		});
		this.socket.on('close', function onClose() {
			server.status = false;
			if (!server.working)
				return;
			log(prefix, server.name.cyan.bold + ': connection closed', '(will retry after 5sec)'.grey);
			setTimeout(server.connect.bind(server), 5000);
		});
		this.socket.on('error', function onError(err) {
			server.status = false;
			warn(prefix, 'socket connection error', err);
			// setTimeout(server.connect.bind(server), 5000);
		});
	}

	addPlayer(username, token) {
		let message = JSON.stringify({
			type: 'new-player',
			username, token
		});

		if (this.status) {
			this.socket.write(message)
		} else {
			this.__toSend.push(message);
		}
	}
}