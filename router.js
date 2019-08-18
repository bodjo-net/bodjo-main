const http = require('http');
const https = require('https');
const fs = require('fs');
const fingerprint = require('./utils/fingerprint.js');

const favicon = fs.readFileSync('./favicon.png');

const prefix = '[router]';

module.exports = function (instruction, port, db, ssl) {
	let apis = keys(instruction);
	function onRequest(req, res) {
		let uri = req.url;
		let url = uri.includes('?') ? uri.substring(0, uri.indexOf('?')) : uri;
		let query = uri.includes('?') ? parseQueryString(uri.substring(uri.indexOf('?')+1)) : {};

		let dirs = url.split(/\//g).filter(d => d.length > 0);

		res.setHeader('Server', 'bodjo-main server (node.js)')
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Access-Control-Allow-Headers', '*');
		
		if (url === '/favicon.ico') {
			res.writeHead(200, {
				'Content-Type': 'image/png',
				'Content-Length': favicon.length
			});
			res.write(favicon);
			res.end();
			return;
		}

		if (dirs.length != 2) {
			res.writeHead(302, {
				'Location': 'https://bodjo.net',
				'Content-Type': 'plain/text'
			});
			res.write("Request should contain exactly 2 directories");
			res.end();
			return;
		}

		if (!apis.includes(dirs[0])) {
			res.statusCode = 404;
			res.write(`"${dirs[0]}" is not found as a part of API. Available API directories: ${apis.map(x => '"'+x+'"').join(', ')}.`);
			res.end();
			return;
		}

		let api = instruction[dirs[0]];
		if (!keys(api).includes(dirs[1])) {
			res.statusCode = 404;
			res.write(`"${dirs[0]}" doesn't contain "${dirs[1]}" method. Available methods: ${keys(api).map(x => '"'+x+'"').join(', ')}.`);
			res.end();
			return;
		}

		let method = api[dirs[1]];
		let postprefix = '{'+(req.connection.remoteAddress+'').grey.bold+'}';
		function answer(o) {
			if (typeof o === 'object' && o != null) {
				let R = JSON.stringify(o);
				log(prefix, postprefix, 'returned', short(R).cyan);
				res.writeHead(200, {
					'Content-Type': 'application/json'
				});
				res.write(R);
				res.end();
			} else if (typeof o === 'string') {
				log(prefix, postprefix, 'returned', short(o).cyan);
				res.writeHead(200, {
					'Content-Type': 'plain/text'
				});
				res.write(o);
				res.end();
			} else if (o instanceof Buffer) {
				log(prefix, postprefix, 'returned', `<Buffer ${o.length}>`.cyan);
				res.statusCode = 200;
				res.write(o);
				res.end();
			} else {
				log(prefix, postprefix, 'returned', short(o+'').cyan);
				res.statusCode = 200;
				res.write(o);
				res.end();
			}
		}

		log(prefix, postprefix, `received ${url.magenta} (${keys(query).map(k=>`${k.green.bold} = ${(query[k]+'').blue.bold}`).join(', ')})`);
		let response = method(query, req, res, db);
		if (response instanceof Promise) {
			response
				.then(answer)
				.catch((e) => {
					err(prefix, 'error while working on request'.bold, e);
					answer(errObj(-1, 'Server Error'));
				})
		} else {
			answer(response);
		}
	}

	let server;
	if (ssl && requireKeys(ssl, ['cert', 'key'], 'ssl options', false)) {
		let cert = fs.readFileSync(ssl.cert);
		let key = fs.readFileSync(ssl.key);

		// let credentials = crypto.createCredentials({key, cert});
		server = https.createServer({key, cert}, onRequest);
	} else
		server = http.createServer(onRequest);
	server.listen(port, (error) => {
		if (error)
			fatalerr(prefix, 'http server listen error', error);
		log(prefix, 'http server '+'successfully'.green.bold+' started at', (':'+port).yellow.bold);
	})
}

const checkers = {
	require: checker(v => typeof v !== 'undefined' && v != null, 'is required'),
	optional: checker(() => true, ''),
	default: checker(() => true, ''),
	string: checker(v => typeof v === 'string', 'should be a string'),
	number: checker(v => typeof v === 'number', 'should be a number'),
	object: checker(v => typeof v === 'object' && v != null && !Array.isArray(v), 'should be an object'),
	array: checker(v => Array.isArray(v), 'should be an array'),
	boolean: checker(v => typeof v === 'boolean', 'should be a boolean'),
	arraylen: checker((v, min, max) => Array.isArray(v) && (typeof min === 'number' ? v.length >= min : true) && (typeof max === 'number' ? v.length <= max : true), (min, max) => `should be an array with ${min}-${max} length`),
	len: checker((v, min, max) => typeof v === 'string' && (typeof min === 'number' ? v.length >= min : true) && (typeof max === 'number' ? v.length <= max : true), (min, max) => `should be a string with ${min}-${max} length`),
	range: checker((v, min, max) => typeof v === 'number' && (typeof min === 'number' ? v >= min : true) && (typeof max === 'number' ? v <= max : true), (min, max) => `should be a number in range [${min}; ${max}]`),
	strict: checker(v => typeof v === 'string' && v.split('').every(s => "1234567890qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM_-".indexOf(s) >= 0), 'should have strict symbols only'),
	email: checker(v => typeof v === 'string' && /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/.test(v.toLowerCase()), 'should have an email pattern'),
	token: checker(async function (v, req, res, db) {
		let tokens = await db.query(`SELECT * 
									 FROM \`bodjo-tokens\` 
									 WHERE \`value\`=${escape(v)}
									 LIMIT 10;`);
		tokens = tokens.filter(token => {
			return token.expired > Date.now() && fingerprint.compare(token.data, req);
		});
		if (tokens.length == 0)
			return false;
		return tokens[0];
	}, 'should be a verified token (probably token is expired or invalid)')
}
function parseQueryString(str) {
	let params = str.split(/\&/g);
	let result = {};
	for (let param of params) {
		let key = decodeURIComponent(param.indexOf('=') >= 0 ? param.substring(0,param.indexOf('=')) : param);
		let value = decodeURIComponent(param.indexOf('=') >= 0 ? param.substring(param.indexOf('=')+1) : 'true');
		if (/^[\d\.\,]+$/.test(value.trim()) && (value.match(/\./g)||[]).length <= 1) {
			try {
				let parseTrying = parseFloat(value);
				if (!isNaN(parseTrying))
					value = parseTrying;
			} catch (e) {}
		}
		if (value === 'true' || value === 'false')
			value = value === 'true';
		result[key] = value;
	}
	return result;
}
function checker(f, str) {
	return {func: f, str: str};
}
global.m = function (options, func) {
	let parsedOptions = {};
	for (let field in options) {
		parsedOptions[field] = options[field].split(';');
		for (let i = 0; i < parsedOptions[field].length; ++i) {
			let option = parsedOptions[field][i];
			if (option.indexOf('=') >= 0) {
				let parameters = option.substring(option.indexOf('=')+1).split(',').map(p => {
					if (p === 'true' || p === 'false')
						return p === 'true';
					if (p === 'null') return null;
					if (p === 'undefined') return undefined;
					if (/^[\d\.]+$/.test(p.trim())) {
						try {
							let parsed = parseFloat(p);
							if (!isNaN(parsed))
								return parsed;
						} catch (e) {}
					}
					return p;
				});
				parsedOptions[field][i] = [option.substring(0, option.indexOf('=')), parameters];
			}
		}
	}

	return async function (query, req, res, db) {
		for (let field in parsedOptions) {
			if (parsedOptions[field].includes("optional") && 
				typeof query[field] === 'undefined') {
				let defaultOption;
				if (defaultOption = parsedOptions[field].find(x => x[0] == 'default'))
					query[field] = defaultOption[1][0];
				continue;
			}
			if (parsedOptions[field].includes("string") &&
				(typeof query[field] === 'number' || typeof query[field] === 'boolean'))
				query[field] = query[field] + '';

			for (let option of parsedOptions[field]) {
				let key = option, args = [query[field]];
				if (Array.isArray(option)) {
					key = option[0];
					args = args.concat(option[1]);
				}
				args.push(req, res, db);
				let R = checkers[key].func.apply(null, args);
				if (R instanceof Promise)
					R = await R;
				if (!R) {
					let errorText = checkers[key].str;
					if (typeof errorText === 'function')
						errorText = errorText.apply(null, args.slice(1));
					return errObj(0, `\"${field}\" ${errorText}`, field);
				} else if (typeof R !== 'boolean')
					query[field] = R;
			}
		}
		return func(query, req, res);
	}
}

global.errObj = function (errCode, errText, errParameter) {
	let o = {
		status: 'fail',
		errCode,
		errText
	};
	if (typeof errParameter !== 'undefined')
		o.errParameter = errParameter;
	return o;
}
global.okObj = function (result) {
	if (arguments.length == 0)
		return {status: 'ok'};
	if (typeof result === 'object' &&
		!Array.isArray(result) &&
		result != null)
		return Object.assign(result, {status: 'ok'});
	return {
		status: 'ok',
		result
	};
}