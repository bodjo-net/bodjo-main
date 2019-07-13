global.log = function () {
	console.log(date() + ' ['+ 'log'.bold.cyan + '] ' + toArr(arguments).join(' '));
}
global.warn = function () {
	console.log(date() + ' [' + 'warn'.bold.yellow + '] ' + toArr(arguments).join(' '));
}
global.err = function () {
	let args = toArr(arguments), err = null;
	if (args.length > 0) {
		err = args[args.length - 1];
		args = args.slice(0, args.length - 1);
	}
	console.log(date() + ' [' + 'err'.bold.red + '] ' + args.join(' '));
	if (err != null)
		throw err;
}

function date() {
	var d = new Date();
	return '['+[z(d.getHours()),z(d.getMinutes()),z(d.getSeconds())].join(':') + '.' + z(d.getMilliseconds()) + ' ' + [z(d.getDate()),z(d.getMonth()+1),z(d.getYear()-100)].join('.')+']';
}
function z(v, n) {
	if (typeof v !== 'string')
		v = v+'';
	if (typeof n !== 'number')
		n = 2;
	if (v.length < n)
		return '0'.repeat(n - v.length) + v;
	return v;
}
function toArr(args) {
	return Array.prototype.slice.call(args);
}