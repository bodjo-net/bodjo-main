const LOGS_DIR = 'logs/';

require('colors');
const fs = require('fs');

if (!fs.existsSync(LOGS_DIR))
	fs.mkdirSync(LOGS_DIR);

let logFilePattern = 'log_{date}_({i}).txt';
let i = 0;
let logFileP = logFilePattern.replace('{date}', date('_', true)),
	logFile = logFileP.replace('{i}', i);
while (fs.existsSync(LOGS_DIR + logFile)) {
	i++;
	logFile = logFileP.replace('{i}', i);
}
fs.writeFileSync(LOGS_DIR + logFile, `\t\n\tbodjo logs\n\t${date()}\n\n`);

global.log = function () {
	append(`[${date().bold}] [${'log'.cyan.bold}] ` + arr(arguments).map(toString).join(' '));
}
global.debug = function () {
	append(`[${date().bold}] [${'debug'.cyan}] ` + arr(arguments).map(toString).join(' '));
}
global.warn = function () {
	let args = arr(arguments), error = null;
	if (args.length > 0 &&
		typeof args[args.length - 1].stack === 'string') {
		error = args[args.length - 1];
		args.splice(args.length - 1, 1);
	}
	append(`[${date().bold}] [${'warn'.yellow.bold}] ` + args.map(toString).join(' '));
	if (error != null)
		append(error.stack);
}
global.warnShort = function () {
	append(`[${date().bold}] [${'warn'.yellow.bold}] ` + arr(arguments).map(toString).join(' '));
}
global.err = function () {
	let args = arr(arguments), error = null;
	if (args.length > 0 &&
		typeof args[args.length - 1].stack === 'string') {
		error = args[args.length - 1];
		args.splice(args.length-1, 1);
	}
	append(`[${date().bold}] [${'err'.red.bold}] ` + args.map(toString).join(' '));
	if (error != null)
		throw (error.stack);
}
global.errShort = function () {
	append(`[${date().bold}] [${'err'.yellow.bold}] ` + arr(arguments).map(toString).join(' '));
}
global.fatalerr = function () {
	let args = arr(arguments), error = null;
	if (args.length > 0 &&
		typeof args[args.length - 1].stack === 'string') {
		error = args[args.length - 1];
		args.splice(args.length-1, 1);
	}
	append(`[${date().bold}] [${'fatal-err'.red.bold}] ` + args.map(toString).join(' '));
	if (error != null)
		throw (error.stack);
	process.exit(0);
}

function append(string) {
	let withoutAnsi = string.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

	console.log(string);
	fs.appendFile(LOGS_DIR + logFile, withoutAnsi + '\n', function (error) {
		if (error) {
			console.log(`error accessing ${(LOGS_DIR+logFile).cyan.bold}`);
			throw error;
		}
	});
}
function toString(o) {
	if (o instanceof Error)
		return o.toString().red.bold;
	if (typeof o === 'object')
		return JSON.stringify(o, null, '\t');
	return o+'';
}
function date(separator, dateOnly) {
	let d = new Date();
	let res = [
		[
			addZeros(d.getDate()), 
			addZeros(d.getMonth()),
			addZeros(d.getFullYear()-2000)
		].join(separator || '.'),
		dateOnly ? '' : [
			addZeros(d.getHours()),
			addZeros(d.getMinutes()),
			addZeros(d.getSeconds())
		].join(':')
	].join(separator || ' ') + (!dateOnly ? '.'+addZeros(d.getMilliseconds(), 3) : '');
	if (dateOnly)
		res = res.slice(0, res.length - 1);
	return res;
}
function addZeros(string, n) {
	if (typeof string !== 'string')
		string = string + '';
	if (typeof n !== 'number')
		n = 2;
	if (string.length >= n)
		return string;
	return '0'.repeat(n - string.length) + string;
}

log('[logger] Logging to ' + (LOGS_DIR + logFile).cyan.bold);
