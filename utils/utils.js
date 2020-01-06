const fs = require('fs');

global.arr = function (args) {
	return Array.prototype.slice.apply(args);
}
global.readConfig = function (filename = 'config.json') {
	if (!fs.existsSync(filename))
		err(`config file ${filename.cyan.bold} doesn't exist`);

	let raw;
	try {
		raw = fs.readFileSync(filename).toString();
	} catch (e) {
		err(`error accessing config file ${filename.cyan.bold}`, e);
	}

	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch (e) {
		err(`error parsing config file ${filename.cyan.bold}`, e);
	}

	return parsed;
}
global.keys = function (obj) {
	return Object.keys(obj);
}
global.contain = function (arr1, arr2) {
	if (!Array.isArray(arr2))
		return arr1.includes(arr2);
	return arr2.every(a => arr1.includes(a));
}
global.requireKeys = function (obj, requiredKeys, name, fatal = true) {
	if (typeof obj !== 'object' ||
		Array.isArray(obj) || obj == null) {
		(fatal ? fatalerr : err)(name, 'doesn\'t contain JSON object');
		return false;
	}
	if (!contain(keys(obj), requiredKeys)) {
		(fatal ? fatalerr : err)(name, 'doesn\'t contain keys:', requiredKeys.map(x => x.cyan.bold).join(', '))
		return false;
	}
	return true;
}
global.randomString = function (n = 16) {
	return Array.from({length:n},()=>(q="qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM1234567890")[Math.round(Math.random()*(q.length-1))]).join('');
}
global.short = function (string, n = 250) {
	return string.length > n ? string.slice(0, n)+'...' : string;
}

global.queryString = function (obj) {
	return Object.keys(obj).map(key => encodeURIComponent(key) + '=' + encodeURIComponent(obj[key])).join('&');
}
global.queryObject = function (str) {
	let o = {};
	str.split('&').map(param => {
		if (param.indexOf('=') < 0)
			o[decodeURIComponent(param)] = true;
		else
			o[decodeURIComponent(param.substring(0, param.indexOf('=')))] = decodeURIComponent(param.substring(param.indexOf('=')+1));
	});
	return o;
}
const URL = require('url');
const http = require('http');
const https = require('https');
function keysOnly(obj, keys) {
	let nobj = {};
	for (let k of keys)
		nobj[k] = obj[k];
	return nobj;
}
global.reqhttp = function (method, url, data, headers={}) {
	return new Promise((resolve, reject) => {
		let u = URL.parse(url);
		if (u.port == null)
			u.port = u.protocol == 'https:' ? 443 : 80;
		let options = Object.assign({method: method, headers, family: 4}, keysOnly(u, ['hostname', 'path', 'port']));
		let req = (u.protocol == 'https:' ? https : http).request(
			options, 
			function (res) {
				let chunks = [];
				res.on('error', reject);
				res.on('err', reject);
				res.on('data', chunk => chunks.push(chunk));
				res.on('close', () => resolve(Buffer.concat(chunks).toString()));
			}
		);
		req.on('error', reject);
		req.on('err', reject);
		if (data)
			req.write(data);
		req.end();
	});
}
global.GET = function (url, headers={}) {
	return reqhttp('GET', url, null, headers);	
}
global.POST = function (url, data, headers={}) {
	return reqhttp('POST', url, data, headers);
}
global.PUT = function (url, data, headers={}) {
	return reqhttp('PUT', url, data, headers);
}