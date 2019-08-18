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
	return Array.from({length:n},()=>(q="qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM1234567890")[Math.round(Math.random()*(n-1))]).join('');
}
global.short = function (string, n = 50) {
	return string.length > n ? string.slice(0, n)+'...' : string;
} 