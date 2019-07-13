const http = require('http'),
	  crypto = require('crypto'),
	  fs = require('fs'),
	  qs = require('query-string');

module.exports = function (module, port, ssl) {
	function handler(req, res) {
		let uri = req.url, url = uri;
		let queryString = uri.indexOf('?') >= 0 ? uri.substring(uri.indexOf('?')+1) : '';
		let query = qs.parse(queryString);
		if (uri.indexOf('?') >= 0)
			url = uri.substring(0, uri.indexOf('?'));

		if (url[url.length-1] == '/')
			url = url.substring(0, url.length - 1);

		if (typeof module[url] === 'object') {
			
		} else {
			res.writeHead(404, {'Content-Type': 'application/json'});
			res.end();
		}
	}

	var server = http.createServer();
	server.addListener('request', handler);
	if (typeof ssl !== 'undefined') {
		let key = fs.readFileSync(ssl.key).toString();
		let cert = fs.readFileSync(ssl.cert).toString();

		let credentials = crypto.createCredentials({key, cert});

		server.setSecure(credentials);
	}
	server.listen(port);
}

// module
// let a = 
// {
// 	'/account/login': {
// 		p: {
// 			username: [string(),len(3, 25),strict()],
// 			password: optional(string(), len(3, 25), strict())
// 		},
// 		method: function (p, req, res) {

// 		}
// 	}
// }

function optional() {
	let args = arguments;
	return value => {
		if (typeof value === 'undefined')
			return true;

		for (let i = 0; i < args.length; ++i)
			if (!args[i](value))
				return false;
		return true;
	}
}
var checkers = {
	string: c(o => typeof o === 'string'),
	number: c(o => typeof o === 'number'),
	object: c(o => typeof o === 'object' && o != null && !Array.isArray(o)),
	range: c((x, min, max) => {
		if (typeof min === 'number' && x < min)
			return false;
		if (typeof max === 'number' && x > max)
			return false;
		return true;
	}),
	strict: c(str => {
		const S = "1234567890qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM_-";
		for (let i = 0; i < str.length; ++i)
			if (S.indexOf(str[i]) == -1)
				return false;
		return true;
	}),
	len: c((str, min, max) => {
		if (typeof min === 'number' && str.length < min)
			return false;
		if (typeof max === 'number' && str.length > max)
			return false;
		return true;
	})
}
function c(func) {
	return function () {
		let args = Array.prototype.slice.call(arguments);
		return (value) => {
			return func.apply(null, [value].concat(args));
		}
	}
}
for (let c in checkers)
	global[c] = checkers[c];