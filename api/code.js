module.exports = (db) => ({
	date: m({
		token: 'require;string;token',
		game: 'require;string'
	}, async function (p) {
		let code = await db.query(`SELECT \`date\` FROM \`bodjo-code\`
								   WHERE \`username\`=${escape(p.token.username)} AND
								   		 \`game\`=${escape(p.game)}
								   LIMIT 1`);
		if (code.length == 0)
			return errObj(1, 'not found');
		return okObj(code[0].date);
	}),
	load: m({
		token: 'require;string;token',
		game: 'require;string'
	}, async function (p) {
		let code = await db.query(`SELECT \`date\`, \`content\` FROM \`bodjo-code\`
								   WHERE \`username\`=${escape(p.token.username)} AND
								   		 \`game\`=${escape(p.game)}
								   LIMIT 1`);
		if (code.length == 0)
			return errObj(1, 'not found');
		return okObj(code[0]);
	}),
	save: m({
		token: 'require;string;token',
		game: 'require;string'
	}, async function (p, req) {
		if (req.method !== 'POST')
			return errObj(1, 'method should be POST');
		if (!req.headers['content-type'].split(/\; {0,}/g).includes('plain/text'))
			return errObj(2, 'method should contain "plain/text" in Content-Type header');

		let games = await db.query(`SELECT \`game\` FROM \`bodjo-games\``);
		let found = false;
		for (let game of games) {
			if (game.game == p.game) {
				found = true;
				break;
			}
		}
		if (!found)
			return errObj(3, 'game is not found');

		let content = await new Promise((resolve, reject) => {
			let chunks = [];
			req.on('data', chunk => chunks.push(chunk));
			req.on('end', () => {
				resolve(Buffer.concat(chunks).toString())
			});
		});

		let code = await db.query(`SELECT \`date\` FROM \`bodjo-code\`
								   WHERE \`username\`=${escape(p.token.username)} AND
								   		 \`game\`=${escape(p.game)}
								   LIMIT 1`);
		if (code.length == 0) {
			await db.query(db.insertQuery('bodjo-code', {
				username: p.token.username,
				game: p.game,
				date: Date.now(),
				content
			}));
		} else {
			await db.query(`UPDATE \`bodjo-code\`
							SET \`content\`=${escape(content)}
							WHERE \`username\`=${escape(p.token.username)} AND
								  \`game\`=${escape(p.game)}`);
		}

		return okObj();
	})
})