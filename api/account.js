const bcrypt = require('bcrypt');
const { Form } = require('multiparty');

const tokenExpiration = 1000 * 60 * 60 * 24 * 2;
const saltRounds = 10;

let cache = {};

async function returnToken(db, fingerprint, username, req) {
	let tokens = await db.query(`SELECT *
								 FROM \`bodjo-tokens\`
								 WHERE \`username\`=${escape(username)}
								 LIMIT 10`);
	
	tokens = tokens.filter(token => {
		return token.expired > Date.now() && fingerprint.compare(token.data, req)
	});

	if (tokens.length == 0) {
		let newToken = {
			username: username,
			value: randomString(32),
			expired: Date.now() + tokenExpiration,
			data: fingerprint.create(req)
		};
		await db.query(db.insertQuery('bodjo-tokens', newToken));

		delete newToken.data;
		return okObj({
			token: newToken
		});
	} else {
		let token = tokens[0];
		token.expired = Date.now() + tokenExpiration;
		token.data = fingerprint.create(req);
		await db.query(`UPDATE \`bodjo-tokens\`
						SET \`expired\`=${token.expired},
							\`data\`=${escape(token.data)}
						WHERE \`username\`=${escape(token.username)} AND
							  \`value\`=${escape(token.value)}`);

		delete token.data;
		return okObj({
			token: token
		});
	}
}
function convertUsername(username) {
	let accessable = '1234567890qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM_-';
	return username.split('').map(s => {
		if (accessable.indexOf(s) >= 0)
			return s;
		return '_';
	}).join('');
}

function rmKey(obj, key) {
	obj = Object.assign({}, obj);
	delete obj[key];
	return obj;
}
function rmKeys(obj, keys) {
	let o = obj;
	for (let key of keys)
		o = rmKey(obj, key);
	return o;
}

module.exports = (db, config) => {
	const userImage = require('../utils/user-image.js')(config['images-dir'], config['images-url']);
	const fingerprint = require('../utils/fingerprint.js');

	async function social(purpose, socialname, p) {
		let redirect_uri = config.oauth_redirect_uri
								 .replace('{social}', socialname)
								 .replace('{purpose}', purpose);
		let oauth = config.oauth[socialname];
		//if (socialname === 'github' || socialname === 'discord') {

		if (typeof p.code !== 'string')	
			return {err:errObj(3, 'parameter "code" missing', 'code')};

		let res = (await POST(
			oauth.url, 
			queryString(Object.assign(
				{code: p.code, redirect_uri}, 
				rmKeys(oauth, ['url', 'bot', 'guild'])
			)),
			{ 'Content-Type': 'application/x-www-form-urlencoded' }
		));
		if (socialname === 'github')
			res = queryObject(res);
		else if (socialname === 'discord' || socialname === 'google')
			res = JSON.parse(res);

		if (typeof res.access_token !== 'string')
			return {err: errObj(4, 'failed to obtain access_token')};

		access_token = res.access_token;
		if (socialname === 'github') {
			let info = JSON.parse(await GET('https://api.github.com/user', {
				'User-Agent': 'bodjo-main',
				'Authorization': 'token ' + access_token
			}));

			if (!info.node_id)
				return {err: errObj(5, 'failed to obtain user info')};

			id = info.node_id;
			userInfo = {
				username: convertUsername(info.login),
				email: info.email,
				about: info.bio || ''//,
				//image: info.avatar_url
			};
		} else if (socialname === 'discord') {
			let info = JSON.parse(await GET('https://discordapp.com/api/v6/users/@me', {
				'User-Agent': 'bodjo-main',
				'Authorization': 'Bearer ' + access_token
			}));

			if (!info.id)
				return {err: errObj(5, 'failed to obtain user info')};

			id = info.id;
			userInfo = {
				username: convertUsername(info.username),
				email: info.email//,
				//about: (
				//	(info.bio ? info.bio + '\n' : '') +
					//	(info.blog ? 'Website: ' + info.blog : '')
				//),
				//image: info.avatar_url
			};
		} else if (socialname === 'google') {
			let info = JSON.parse(await GET('https://www.googleapis.com/oauth2/v1/userinfo', {
				'User-Agent': 'bodjo-main',
				'Authorization': 'Bearer ' + access_token
			}));

			id = info.id;
			userInfo = {
				username: convertUsername(info.name),
				email: info.email || ''//,
				// image: info.picture
			}
		}

		// } else {
		// 	return {err: errObj(1, "social not found")};
		// }

		return {id, userInfo, access_token};
	}

	return {
		check: m(
			{
				token: 'require;string;token'
			},
			function (p, req, res) {
				delete p.token.data;
				return okObj({token: p.token});
			}
		),
		login: m({
			social: 'require;string',
			code: 'string'
		}, async function (p, req, res) {
			if (typeof config.oauth[p.social] !== 'object')
				return errObj(1, 'social not found', 'social');

			let {err, id, userInfo, access_token} = await social('login', p.social, p);
			if (err)
				return err;

			let users = await db.query(`SELECT username FROM \`bodjo-users\`
										WHERE \`${p.social}-id\`=${escape(id)}
										LIMIT 1`);
			if (users.length == 1) {
				return await returnToken(db, fingerprint, users[0].username, req);
			} else if (p.social === 'discord') {
				// join account to the guild
				let oauth = config.oauth[p.social];
				await PUT('https://discordapp.com/api/v6/guilds/' + oauth.guild + '/members/' + id, 
					JSON.stringify({
						access_token
					}), {
					'Authorization': 'Bot ' + oauth.bot,
                    'User-Agent': 'bodjo-main',
                    'Content-Type': 'application/json'
				})
			}

			let hash = randomString(16);
			cache[hash] = {
				social: p.social, id
			};

			return okObj({recommendedInfo: userInfo, hash});
		}),
		attach: m({
			token: 'require;string;token',
			social: 'require;string',
			code: 'string'
		}, async function (p, req, res) {
			if (typeof config.oauth[p.social] !== 'object')
				return errObj(1, 'social not found', 'social');

			let {err, id} = await social('attach', p.social, p);
			if (err)
				return err;

			let users = await db.query(`SELECT username FROM \`bodjo-users\`
										WHERE \`${p.social}-id\`=${escape(id)}
										LIMIT 1`);
			if (users.length == 1) {
				// dettach from another account
				await db.query(`UPDATE \`bodjo-users\`
								SET \`${p.social}-id\`=null
								WHERE \`${p.social}-id\`=${escape(id)}`);
			}
			await db.query(`UPDATE \`bodjo-users\`
							SET \`${p.social}-id\`=${escape(id)}
							WHERE \`username\`=${escape(p.token.username)}`);
			return okObj();
		}),
		_login: m(
			{
				username: 'require;string;len=3,15;strict',
				password: 'require;string;len=6,100'
			},
			async function (p, req) {
				let users = await db.query(`SELECT * 
											FROM \`bodjo-users\`
											WHERE \`username\`=${escape(p.username)}
											LIMIT 1`);
				if (users.length == 0)
					return errObj(1, 'user/password is not found');

				let user = users[0];
				if (user.password == null || user.password.length == 0)
					return errObj(1, 'user/password is not found');
				let auth = await bcrypt.compare(p.password, user.password);

				if (!auth)
					return errObj(1, 'user/password is not found');

				return await returnToken(db, fingerprint, p.username, req);
			}
		),
		logout: m({
			token: 'require;string;token'	
		}, async function (p) {
			await db.query(`DELETE FROM \`bodjo-tokens\`
							WHERE \`value\`=${escape(p.token.value)}`);
			return okObj();
		}),
		register: m({
			hash: 'require;string;len=16,16',
			username: 'require;string',
			email: 'string',
			about: 'string'
		}, async function (p, req, res) {
			let cacheobj = cache[p.hash];
			if (typeof cacheobj !== 'object')
				return errObj(1, 'bad hash', 'hash');

			let users = await db.query(`SELECT \`username\` FROM \`bodjo-users\`
										WHERE \`username\`=${escape(p.username)}
										LIMIT 1`);
			if (users.length == 1)
				return errObj(2, 'username is busy', 'username');

			let imageid = userImage.generate(p.username);

			let newUser = {
				username: p.username,
				password: '',
				'registration-time': Date.now(),
				image: imageid,
				permissions: '',
				score: 0,
				about: typeof p.about === 'string' ? p.about : '',
				email: typeof p.email === 'string' ? p.email : ''
			};
			for (let social in config.oauth)
				newUser[social + '-id'] = (social == cacheobj.social ? cacheobj.id : null);
			await db.query(db.insertQuery('bodjo-users', newUser));

			return await returnToken(db, fingerprint, p.username, req);
		}),
		// register: m(
		// 	{
		// 		username: 'require;string;len=3,15;strict',
		// 		password: 'require;string;len=6,100',
		// 		email: 'optional;string;email'
		// 	},
		// 	async function (p, req) {
		// 		if (p.username.length > 3 && p.username.slice(0, 3) == 'bot')
		// 			return errObj(1, '\'username\' should not be with /^bot.+$/g pattern', 'username');
				
		// 		let users = await db.query(`SELECT \`username\`
		// 									FROM \`bodjo-users\`
		// 									WHERE \`username\`=${escape(p.username)}
		// 									LIMIT 1`);
		// 		if (users.length == 1)
		// 			return errObj(0, '\'username\' is already in use', 'username');

		// 		let imageid = userImage.generate(p.username);
		// 		let hash = await bcrypt.hash(p.password, saltRounds);

		// 		let newUser = {
		// 			username: p.username,
		// 			password: hash,
		// 			'registration-time': Date.now(),
		// 			image: imageid,
		// 			permissions: '',
		// 			score: 0,
		// 			about: '',
		// 			email: typeof p.email === 'string' ? p.email : ''
		// 		};

		// 		await db.query(db.insertQuery('bodjo-users', newUser));
		// 		let newToken = {
		// 			username: p.username,
		// 			value: randomString(32),
		// 			expired: Date.now() + tokenExpiration,
		// 			data: fingerprint.create(req)
		// 		};
		// 		await db.query(db.insertQuery('bodjo-tokens', newToken));

		// 		delete newToken.data;
		// 		return okObj({
		// 			token: newToken
		// 		});
		// 	}
		// ),
		// changePassword: m({
		// 	token: 'optional;string;token',
		// 	current: 'optional;string;len=6,100',
		// 	secret: 'optional;string;len=32,32',
		// 	new: 'require;string;len=6,100'
		// }, async function (p) {
			
		// }),
		uploadImage: m({
			token: 'require;string;token',
			ext: 'require;string'
		}, async function (p, req) {
			const MAX_IMAGE_SIZE = 1024 * 1024 * 10;
			if (req.method !== 'POST')
				return errObj(1, 'method should be POST');

			if (!req.headers['content-type'].split(/\; {0,}/g).includes('multipart/form-data'))
				return errObj(2, 'method should contain "multipart/form-data" in Content-Type header');

			if (!['png','jpg','jpeg','gif'].includes(p.ext))
				return errObj(3, 'parameter "ext" should be: png, jpg, jpeg, gif', 'ext');

			let user = await db.query(`SELECT \`image\`
									FROM \`bodjo-users\`
									WHERE \`username\`=${escape(p.token.username)}
									LIMIT 1`);
			if (user.length < 1)
				return errObj(4, 'user was not found', 'token');
			user = user[0];

			let length = req.headers['content-length'];
			let file = await new Promise((resolve, reject) => {
				let form = new Form({
					maxFields: 1,
					maxFieldsSize: MAX_IMAGE_SIZE,
					maxFilesSize: MAX_IMAGE_SIZE,
					autoFiles: false
				});
				form.on('part', part => {
					part.on('error', error => {
						warn('multipart form data receive error:', error);
						reject(error);
					});

					if (part.name != 'image') {
						part.resume();
						return;
					}

					if (part.byteCount > MAX_IMAGE_SIZE) {
						part.resume();
						resolve(-1);
					} else 
						resolve(part);
				});
				form.on('error', error => {
					warn('multipart form data receive error:', error);
					reject(error);
				});
				form.parse(req);
			});
			if (file == -1)
				return errObj(5, 'image is too big (max: 10KB)');

			// let buffer = await new Promise((resolve, reject) => {
			// 	let chunks = [];
			// 	file.on('data', chunk => chunks.push(chunk));
			// 	file.on('end', () => {
			// 		resolve(Buffer.concat(chunks));
			// 	});
			// 	file.on('error', reject);
			// });

			let imageid = user.image.split('|')[0]
			await userImage.upload(user.image, file, p.ext);
			await db.query(`UPDATE \`bodjo-users\`
							SET \`image\`='${imageid}|${p.ext}'
							WHERE \`username\`=${escape(p.token.username)}`);
			return okObj(userImage.get(imageid+'|'+p.ext));
		}),
		info: m({
			username: 'optional;string;strict;len=3,15',
			usernames: 'optional;string',
			token: 'optional;string;token'
		}, async function (p) {
			let receivedToken = !!p.token;
			let receivedUsername = !!p.username;
			let receivedUsernames = !!p.usernames;

			let usernames = [];
			if (receivedToken && !receivedUsername && !receivedUsernames) {
				usernames.push(p.token.username);
			} else if (!receivedToken && receivedUsername && !receivedUsernames) {
				usernames.push(p.username);
			} else if (!receivedToken && !receivedUsername && receivedUsernames) {
				usernames = p.usernames.split(/\,/g);
				if (usernames.length > 25)
					return errObj(1, 'max usernames count: 25');
			} else {
				return errObj(0, 'bad parameters. should be: \"token\" or \"username\" or \"usernames\"');
			}

			let fields = ['username', 'image', 'score', 'about'];
			if (receivedToken) {
				fields.push('email', 'registration-time');
				for (let social in config.oauth)
					fields.push(social + '-id');
			}
			let users = await db.query(`SELECT ${fields.map(x => `\`${x}\``).join(', ')}
										FROM \`bodjo-users\`
										WHERE ${usernames.map(x => '\`username\`='+escape(x)).join(' OR ')}
										LIMIT ${usernames.length}`);
			for (let user of users)
				user.image = userImage.get(user.image);

			if (receivedToken) {
				for (let user of users) {
					for (let social in config.oauth) {
						user[social] = user[social + '-id'] != null;
						delete user[social + '-id'];
					}
				}
			}

			let result = users;
			if (receivedUsernames) {
				result = {};
				for (let username of usernames)
					result[username] = users.find(u => u.username == username) || null;
			}
			return okObj({result});
		}),
		edit: m({
			token: 'require;string;token',
			email: 'optional;string;email',
			about: 'optional;string;len=0,250'
		}, async function (p) {
			let newInfo = {email: p.email||'', about: p.about||''};
			let request = await db.query(`UPDATE \`bodjo-users\`
									   	  SET ${keys(newInfo).map(k => `\`${k}\` = ${escape(newInfo[k])}`).join(', ')}
										  WHERE \`username\`=${escape(p.token.username)}`);
			return okObj();
		})
	}
}