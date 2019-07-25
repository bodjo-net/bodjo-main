const crypto = require('crypto');

function hash(str) {
	let h = crypto.createHash('sha512');
	h.update(str);
	return h.digest('base64');
}

module.exports = {
	create: function (req) {
		return [
			hash(req.headers['user-agent']),
			hash(req.connection.remoteAddress)
		].join('|');
	},
	compare: function (data, req) {
		let arr = data.split('|');
		if (arr.length != 2)
			return false;
		if (hash(req.headers['user-agent']) == arr[0])
			return true;
		if (hash(req.connection.remoteAddress) == arr[1])
			return true;
		return false;
	}
}