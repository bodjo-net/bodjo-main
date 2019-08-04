module.exports = (db) => ({
	can: function (token, methodname, methodparameters, special) {
		if (token == null)

		let permissions = (await loadPermissions(db, token)).split(/\&/g);
		if (permissions.includes('all'))
			return true;

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

		if (methodname == 'pages/edit') {
			let page = special;
			return (page.author == token.username) || (obj.pages && includes(obj.pages, methodparameters.id));
		}

		if (methodname == 'pages/publish') {
			return (obj.pages && includes(obj.pages, methodparameters.id));
		}

		if (methodname == 'games/new' ||
			methodname == 'games/edit') {
			return (obj.games && includes(obj.games, methodparameters.name));
		}

		return false;
	}
});

function includes(arr, b) {
	if (!Array.isArray(arr)) arr = [arr];
	for (let a of arr) {
		// docs.* & docs.hello.world.ru
		if (a == 'all' || a == '*')
			return true;
		if (a[a.length-1] == '*' &&
			a.substring(0, a.length-1) == b.substring(0, a.length-1))
			return true;
	}
	return false;
}

function loadPermissions(db, token) {
	return (await db.query(`SELECT \`permissions\` FROM \`bodjo-users\`
						    WHERE \`username\`=${escape(token.username)}
					 	    LIMIT 1`))[0].permissions;
}
