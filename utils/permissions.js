async function loadPermissions(db, token) {
	let p = (await db.query(`SELECT \`permissions\` FROM \`bodjo-users\`
			 			     WHERE \`username\`=${escape(token.username)}
			 		 	     LIMIT 1`))[0].permissions;
	let permissions = p.split(/\&/g);
	let obj = {};
	for (let permission of permissions) {
		if (permission.indexOf('=') >= 0) {
			let key = permission.substring(0, permission.indexOf('='));
			let value = permission.substring(permission.indexOf('=')+1);
			if (value.indexOf(',') >= 0)
				value = value.split(/\,/g);
			obj[key] = value;
		} else
			obj[permission] = true;
	}
	return obj;
}

module.exports = (db) => ({
	load: loadPermissions,
	can: async function (token, methodname, methodparameters, special) {
		let permissions = await loadPermissions(db, token);
		if (permissions.all)
			return true;

		if (methodname == 'pages/edit' ||
			methodname == 'pages/remove') {
			let page = special;
			return (page.author == token.username) || (permissions.pages && includes(permissions.pages, methodparameters.id));
		}

		if (methodname == 'pages/publish') {
			return (permissions.pages && includes(permissions.pages, methodparameters.id));
		}

		if (methodname == 'games/new' ||
			methodname == 'games/edit' ||
			methodname == 'games/remove' ||
			methodname == 'games/info') {
			return (permissions.games && includes(permissions.games, methodparameters.name));
		}

		return false;
	}
});

function includes(arr, b) {
	if (!Array.isArray(arr)) arr = [arr];
	for (let a of arr) {
		if (a == 'all' || a == '*')
			return true;
		// docs.* & docs.hello.world.ru
		if (a[a.length-1] == '*' &&
			a.substring(0, a.length-1) == b.substring(0, a.length-1))
			return true;

		if (a == b)
			return true;
	}
	return false;
}
