var async = require('async');


/**
 * Redis template provider.
 *
 * @param {Object} options = {
 *   redis: "[optional] Redis client instance. If not passed, a localhost connection is created.",
 *   partialPrefix: "[optional] Partial key prefix, defaults to 'hbsp:'",
 *   templatePrefix: "[optional] Template key prefix, defaults to 'hbst:'"
 * }
 * @constructor
 */
function RedisProvider(options) {
  // Create a localhost connection to redis if client instance not passed in.
  if (!options.redis) {
    var redis = require('redis');
    options.redis = redis.createClient();
  }

  if (!options.partialPrefix) options.partialPrefix = 'hbsp:';
  options.partialPrefixLength = options.partialPrefix.length;

  if (!options.templatePrefix) options.templatePrefix = 'hbst:';
  options.templatePrefixLength = options.templatePrefix.length;

  this.options = options;
}


/**
 * Retrieves all partial template stored under the key pattern 'hbsp:*'.
 *
 * @remarks The handlebars markup `{{> script}}` expects the partial from `hbsp:script`.
 * @param {Function} cb The callback `function(err, hashtableResult)`
 */
RedisProvider.prototype.getPartials = function(cb) {
  var options = this.options;
  var redis = options.redis;
  var keyPos = options.partialPrefixLength;

  redis.keys(options.partialPrefix + '*', function(err, keys) {
    if (err) return cb(err);

    var partials = {};
    function readPartial(key, cb) {
      redis.get(key, function(err, text) {
        if (err) return cb(err);
        partials[key.substr(keyPos)] = text;
        cb();
      })
    }

    async.forEach(keys, readPartial, function(err) {
      cb(err, partials);
    });
  });
};


/**
 * Gets template from the key 'hbst:PATH'.
 *
 * @param {String} path
 * @param {Function} cb
 */
RedisProvider.prototype.getTemplate = function(path, cb) {
  var options = this.options;
  options.redis.get(options.templatePrefix + path, cb);
};


module.exports = RedisProvider;
