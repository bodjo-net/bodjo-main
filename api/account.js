const bcrypt = require('bcrypt');
const { Form } = require('multiparty');

const tokenExpiration = 1000 * 60 * 60 * 24 * 2;
const saltRounds = 10;

module.exports = (db, config) => {
	const userImage = require('../utils/user-image.js')(config['images-dir'], config['images-url']);
	const fingerprint = require('../utils/fingerprint.js');
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
		login: m(
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
				let auth = await bcrypt.compare(p.password, user.password);

				if (!auth)
					return errObj(1, 'user/password is not found');

				let tokens = await db.query(`SELECT *
											 FROM \`bodjo-tokens\`
											 WHERE \`username\`=${escape(p.username)}
											 LIMIT 10`);
				
				tokens = tokens.filter(token => {
					return token.expired > Date.now() && fingerprint.compare(token.data, req)
				});

				if (tokens.length == 0) {
					let newToken = {
						username: p.username,
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
					})
				}
			}
		),
		logout: m(
			{
				token: 'require;string;token'	
			},
			async function (p) {
				await db.query(`DELETE FROM \`bodjo-tokens\`
								WHERE \`value\`=${escape(p.token.value)}`);
				return okObj();
			}
		),
		register: m(
			{
				username: 'require;string;len=3,15;strict',
				password: 'require;string;len=6,100',
				email: 'optional;string;email'
			},
			async function (p, req) {
				if (p.username.length > 3 && p.username.slice(0, 3) == 'bot')
					return errObj(1, '\'username\' should not be with /^bot.+$/g pattern', 'username');
				
				let users = await db.query(`SELECT \`username\`
											FROM \`bodjo-users\`
											WHERE \`username\`=${escape(p.username)}
											LIMIT 1`);
				if (users.length == 1)
					return errObj(0, '\'username\' is already in use', 'username');

				let imageid = userImage.generate(p.username);
				let hash = await bcrypt.hash(p.password, saltRounds);

				let newUser = {
					username: p.username,
					password: hash,
					'registration-time': Date.now(),
					image: imageid + '|png',
					permissions: '',
					score: 0,
					about: '',
					email: typeof p.email === 'string' ? p.email : ''
				};

				await db.query(db.insertQuery('bodjo-users', newUser));
				let newToken = {
					username: p.username,
					value: randomString(32),
					expired: Date.now() + tokenExpiration,
					data: fingerprint.create(req)
				};
				await db.query(db.insertQuery('bodjo-tokens', newToken));

				delete newToken.data;
				return okObj({
					token: newToken
				});
			}
		),
		changePassword: m({
			token: 'optional;string;token',
			current: 'optional;string;len=6,100',
			secret: 'optional;string;len=32,32',
			new: 'require;string;len=6,100'
		}, async function (p) {
			
		}),
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
			if (receivedToken)
				fields.push('email', 'registration-time');
			let users = await db.query(`SELECT ${fields.map(x => `\`${x}\``).join(', ')}
										FROM \`bodjo-users\`
										WHERE ${usernames.map(x => '\`username\`='+escape(x)).join(' OR ')}
										LIMIT ${usernames.length}`);
			for (let user of users)
				user.image = userImage.get(user.image);

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