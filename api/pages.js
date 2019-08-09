
module.exports = (db) => {
	const permissions = require('./../utils/permissions.js')(db);
	
	return ({	
	load: m({
		id: "require;string",
		preview: "optional;boolean;default=false"
	}, async function (p) {
		let previewString = p.preview ? `LEFT(\`content\`,IF(POSITION('~~~~~' IN \`content\`)>0,POSITION('~~~~~' IN \`content\`)-1,200))` : '';
		let pages = await db.query(`SELECT \`id\`,\`author\`,\`date-published\`,\`date-edited\`, ${previewString.length>0?','+previewString:'`content`'}
								   FROM \`bodjo-pages\`
								   WHERE \`id\`=${escape(p.id)}
								   LIMIT 1;`);
		if (pages.length == 0)
			return errObj(1, 'page is not found');
		let page = pages[0];
		if (previewString.length > 0) {
			page.content = page[previewString];
			delete page[previewString];
		}
		return okObj({page});
	}),
	search: m({
		q: "require;string",
		count: "optional;number;range=1,10;default=5",
		offset: "optional;number;default=0",
		preview: "optional;number;range=1,200;default=0",
		order: "optional;boolean;default=true"
	}, async function (p) {
		let previewString = p.preview > 0 ? `LEFT(\`content\`,IF(POSITION('~~~~~' IN \`content\`)>0,POSITION('~~~~~' IN \`content\`)-1,${p.preview}))` : '';
		let result = await db.query(`SELECT SQL_CALC_FOUND_ROWS \`id\`, \`author\`, \`date-published\`, \`date-edited\`${previewString != '' ? ', '+previewString : ''}
									 FROM \`bodjo-pages\`
									 WHERE LOCATE(${escape(p.q)}, \`id\`)>0
									 ORDER BY \`id\` ${p.order?'ASC':'DESC'}
									 LIMIT ${p.count}
									 OFFSET ${p.offset}`);
		let total = await db.query(`SELECT FOUND_ROWS();`);
		if (total.length == 1)
			total = total[0]['FOUND_ROWS()'];
		else total = 0;
		for (let page of result) {
			page.preview = (page[previewString]);
			delete page[previewString];
		}
		return okObj({pages: result, offset: p.offset, count: p.count, total});
	}),
	publish: m({
		id: "require;string",
		token: "require;string;token"
	}, async function (p, req) {
		if (req.method !== 'POST')
			return errObj(1, 'method should be POST');

		if (!req.headers['content-type'].split(/\; {0,}/g).includes('plain/text'))
			return errObj(2, '"Content-Type" should be "plain/text"');

		if (!(await permissions.can(p.token, 'pages/publish', p)))
			return errObj(3, 'access denied');

		let pages = await db.query(`SELECT \`id\`
								   FROM \`bodjo-pages\`
								   WHERE \`id\`=${escape(p.id)}
								   LIMIT 1`);
		if (pages.length > 0)
			return errObj(4, 'page has been already published; try pages/edit method instead');

		let content = await new Promise((resolve, reject) => {
			let chunks = [];
			req.on('data', chunk => chunks.push(chunk));
			req.on('end', () => {
				resolve(Buffer.concat(chunks).toString());
			});
		});

		await db.query(db.insertQuery('bodjo-pages', {
			id: p.id,
			author: p.token.username,
			'date-published': Date.now(),
			'date-edited': 0,
			content
		}));

		return okObj();
	}),
	edit: m({
		id: "require;string",
		token: "require;string;token"
	}, async function (p, req) {
		if (req.method !== 'POST')
			return errObj(1, 'method should be POST');

		if (!req.headers['content-type'].split(/\; {0,}/g).includes('plain/text'))
			return errObj(2, '"Content-Type" should be "plain/text"');


		let pages = await db.query(`SELECT \`id\`, \`author\`, \`date-published\`, \`date-edited\` 
								   FROM \`bodjo-pages\`
								   WHERE \`id\`=${escape(p.id)}
								   LIMIT 1`);
		if (pages.length < 0)
			return errObj(3, 'page is not found');

		let page = pages[0];

		if (!(await permissions.can(p.token, 'pages/edit', p, page)))
			return errObj(4, 'access denied');

		let content = await new Promise((resolve, reject) => {
			let chunks = [];
			req.on('data', chunk => chunks.push(chunk));
			req.on('end', () => {
				resolve(Buffer.concat(chunks).toString());
			});
		});

		await db.query(`UPDATE \`bodjo-pages\`
						SET \`content\`=${escape(content)}, \`date-edited\`=${Date.now()}
						WHERE \`id\`=${escape(p.id)}`);
		return okObj();
	}),
	remove: m({
		token: "require;string;token",
		id: "require;string"
	}, async function (p, req) {
		let pages = await db.query(`SELECT \`id\`, \`author\`, \`date-published\`, \`date-edited\` 
								   FROM \`bodjo-pages\`
								   WHERE \`id\`=${escape(p.id)}
								   LIMIT 1`);
		if (pages.length < 0)
			return errObj(0, 'page is not found');
		let page = pages[0];
		if (!(await permissions.can(p.token, 'pages/remove', p, page)))
			return errObj(1, 'access denied');

		await db.query(`DELETE FROM \`bodjo-pages\`
						WHERE \`id\`=${escape(p.id)}`);
		return okObj();
	})
});

};