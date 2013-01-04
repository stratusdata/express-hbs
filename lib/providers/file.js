var fs = require('fs');
var path = require('path');


/**
 * File system template provider.
 *
 * @param options = { partialsPath: "[required] Absolute path to partials directory" }
 */
function FileProvider(options) {
  this.options = options || {};
}


/**
 * Returns the source of a template based on the name, or err if the lookup fails.
 */
FileProvider.prototype.getTemplate = function getTemplate(templateName, cb) {
  fs.readFile(templateName, 'utf-8', cb);
};


/**
 * Callback provides an object where each partial name is the key and the source is the value.
 */
FileProvider.prototype.getPartials = function getPartials(cb) {
  var partialsPath = this.options.partialsPath;
  var files = fs.readdirSync(partialsPath);
  var partials = {};

  files.forEach(function(file) {
    var filePath = path.join(partialsPath, file);
    var stats = fs.statSync(filePath);
    if (!stats.isFile()) return;

    var source = fs.readFileSync(filePath, 'utf8');
    var name = path.basename(file, path.extname(file));
    partials[name] = source;
  });

  cb(null, partials);
};


module.exports = FileProvider;
