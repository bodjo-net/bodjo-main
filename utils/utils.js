global.keys = Object.keys.bind(null);
global.contain = function (arr1, arr2) {
	if (!Array.isArray(arr2))
		return arr1.includes(arr2);
	return arr1.some(x => arr2.includes(x));
}