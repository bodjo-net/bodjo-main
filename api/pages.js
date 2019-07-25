module.exports = (db) => ({
	load: m({
		id: "require;string"
	}, async function (p) {
		let pages = await db.query(`SELECT *
								   FROM \`bodjo-pages\`
								   WHERE \`id\`=${escape(p.id)}
								   LIMIT 1;`);
		if (pages.length == 0)
			return errObj(1, 'page is not found');

		return okObj({page: pages[0]});
	}),
	search: m({
		q: "require;string",
		count: "optional;number;range=1,10;default=5",
		offset: "optional;number;default=0",
		preview: "optional;number;range=0,50;default=0"
	}, async function (p) {
		let previewString = p.preview > 0 ? `LEFT(\`content\`, ${p.preview})` : '';
		let result = await db.query(`SELECT \`id\`, \`author\`, \`date-published\`, \`date-edited\`${previewString != '' ? ', '+previewString : ''}
									 FROM \`bodjo-pages\`
									 WHERE LOCATE(${escape(p.q)}, \`id\`)>0
									 LIMIT ${p.count}
									 OFFSET ${p.offset}`);
		for (let page of result) {
			page.preview = (page[previewString]);
			delete page[previewString];
		}
		debug(result)
		return okObj({pages: result});
	})
});