exports.FileProvider = require('./file');

// Other providers have their own dependencies and options. Those providers must be explicitly required
// so as not to force extra library dependencies on users who do not use these alternatives.
//
// require('express-hbs/lib/providers/mongo');


/**
 * Checks if `provider` meets interface.
 *
 * @param provider The provider.
 * @return {Boolean} Returns true if valid, else false.
 */
exports.isValidProvider = function(provider) {
  if (!provider) {
    console.error('express-hbs: Template provider is null or undefined');
    return false;
  }

  var properties = ['getPartials', 'getTemplate'];

  for (var i = 0, L = properties.length; i < L; i++) {
    if (!provider[properties[i]]) {
      console.error('express-hbs: Template provider missing property ', properties[i]);
      return false;
    }
  }

  return true;
};
