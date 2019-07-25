const fs = require('fs');
const seedrandom = require('seedrandom');
const { createCanvas, Image } = require('canvas');

const prefix = '[user-image]';
const dimensions = [128, 64, 32];

module.exports = (imageDirectory, imagesURL) => {

	if (!fs.existsSync(imageDirectory)) {
		log(prefix, 'directory (' + imageDirectory.cyan.bold + ') doesn\'t exist: making new...');
		fs.mkdirSync(imageDirectory);
	}
	
	return {
		generate: function (username) {
			log(prefix, 'generating ' + username.cyan.bold + ' icon');

			let random = seedrandom(username);
			let ID = Math.round(random() * 9999999999 + 999999) + '';
			if (fs.existsSync(`${imageDirectory}${ID}_${dimensions[0]}.png`)) {
				log(prefix, 'icon ' + username.cyan.bold + ' is already generated: abort')
				return ID;
			}
			let W = dimensions[0], H = dimensions[0];
			let canvas = createCanvas(W, H);
			let ctx = canvas.getContext('2d');

			ctx.beginPath();
			ctx.arc(W/2, H/2, W/2, 0, Math.PI*2);
			ctx.clip();

			ctx.fillStyle = randomColor(x => 200+x);
			ctx.fillRect(0, 0, W, H);

			let p = W * 0.15;
			let n = Math.round(2 + random() * 3) * 2;
			let data = Array.from({length: n/2}, (_, x) => Array.from({length: n}, (_, y) => {
				return random() > 0.5;
			}));

			ctx.fillStyle = randomColor(x => x-100)
			for (let y = 0; y < n; ++y)
				for (let x = 0; x < n; ++x)
					if (data[x >= (n/2) ? n-x-1 : x][y])
						ctx.fillRect(Math.ceil(p + (W-p*2) / n * x), 
									 Math.ceil(p + (H-p*2) / n * y), 
									 Math.ceil((W-p*2) / n), 
									 Math.ceil((H-p*2) / n));
			ctx.restore();
			function randomColor(f) {
				return '#' + Array.from({length: 3}, () => {
					let n = random() * 255;
					if (typeof f === 'function')
						n = range(f(n), 0, 255);
					let h = Math.round(n).toString(16);
					if (h.length == 1) return '0'+h;
					return h;
				}).join('');
			}

			save(dimensions[0], canvas.toBuffer());
			
			let image = new Image();
			image.src = canvas.toDataURL();
			for (let dimension of dimensions.slice(1)) {
				canvas = createCanvas(dimension, dimension);
				canvas.getContext('2d').drawImage(image, 0, 0, W, H, 0, 0, dimension, dimension);
				save(dimension, canvas.toBuffer());
			}

			function save(d, buffer) {
				let filename = `${imageDirectory}${ID}_${d}.png`;
				log(prefix, `saving ${username.cyan.bold} (${d}) icon to ${filename.magenta.bold}`)
				fs.writeFileSync(filename, buffer);
			}

			return ID;
		},
		get: function (imageid) {
			let id = imageid.split('|')[0];
			let ext = imageid.split('|')[1];

			let imageobj = {};
			for (let dimension of dimensions) {
				if (fs.existsSync(`${imageDirectory}${id}_${dimension}.${ext}`))
					imageobj[dimension] = `${imagesURL}${id}_${dimension}.${ext}`
			}
			return imageobj;
		}
	}
};

function range(x, min, max) {
	return Math.max(Math.min(x, max), min);
}