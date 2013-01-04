var async = require('async');
var providers = require('./providers');
var FileProvider = providers.FileProvider; var path = require('path');

exports.handlebars = require('handlebars');
exports.providers = providers;

/**
 * Handle async helpers
 */
var waiter = require('./waiter');

/**
 * Cache for templates, express 3.x doesn't do this for us
 */
var cache = {};

/**
 * Blocks for layouts. Is this safe? What happens if the same block is used on multiple connections?
 * Isn't there a chance block and contentFor are not in sync. The template and layout are processed
 * asynchronously.
 */
var blocks = {};

/**
 * Copy of options configuration.
 */
var _options;

/**
 * Holds the default compiled layout if specified in options configuration.
 */
var defaultLayoutTemplate;


/**
 * Regex pattern for layout directive. {{!< layout }}
 */
var layoutPattern = /\{\{\!\<\s+([A-Za-z0-9\._\-\/]+)\s*\}\}/;


/**
 * Whether partials have been loaded.
 * @type {boolean}
 */
var partialsLoaded = false;


/**
 * Defines a block into which content is inserted via `contentFor`.
 *
 * @example
 *  In layout.hbs
 *
 *  {{{block "pageStylesheets"}}}
 */
function block(name) {
  var val = (blocks[name] || []).join('\n');
  // clear the block
  blocks[name] = [];
  return val;
}


/**
 * Defines content for a named block usually declared in a layout.
 *
 * @example
 *
 * {{#contentFor "pageStylesheets"}}
 * <link rel="stylesheet" href='{{{URL "css/style.css"}}}' />
 * {{/contentFor}}
 */
function contentFor(name, context) {
  var block = blocks[name];
  if (!block) {
    block = blocks[name] = [];
  }
  block.push(context.fn(this));
}


/**
 * Compiles a layout file.
 *
 * @param {String} layoutFile
 * @param {Boolean} useCache
 * @param {Function} cb
 */
function cacheLayout(layoutFile, useCache, cb) {

  // assume hbs extension
  if (path.extname(layoutFile) === '') layoutFile += _options.extname;

  // path is relative in directive, make it absolute
  var layoutTemplate = cache[layoutFile] ? cache[layoutFile].layoutTemplate : null;
  if (layoutTemplate) return cb(null, layoutTemplate);

  _options.provider.getTemplate(layoutFile, function(err, str) {
    if (err) return cb(err);

    layoutTemplate = exports.handlebars.compile(str);
    if (useCache) {
      cache[layoutFile] = {layoutTemplate: layoutTemplate};
    }

    cb(null, layoutTemplate);
  });
}


/**
 * Cache partial templates found under <views>/partials.
 */
function cachePartials(cb) {
  _options.provider.getPartials(function(err, partials) {
    if (err) return cb(err);

    Object.keys(partials).forEach(function(name) {
      exports.handlebars.registerPartial(name, partials[name]);
    });

    return cb();
  });
}


/**
 * Express 3.x template engine compliance.
 *
 * @param {Object} options = {
 *   handlebars: "override handlebars",
 *   defaultLayout: "path to default layout",
 *   partialsPath: "absolute path/key to partials",
 *   extname: "extension to use"
 * }
 *
 */
exports.express3 = function(options) {
  _options = options || {};
  if (!_options.extname) _options.extname = '.hbs';
  if (_options.handlebars) exports.handlebars = _options.handlebars;
  // _options.partialsDir is checked for backwards compatibility with older version
  if (!_options.partialsPath && _options.partialsDir) _options.partialsPath = _options.partialsDir;
  if (!_options.provider) _options.provider = new FileProvider(_options);
  if (!providers.isValidProvider(_options.provider)) throw new Error('Invalid template provider interface.');

  exports.handlebars.registerHelper('contentFor', contentFor);
  exports.handlebars.registerHelper('block', block);

  return _express3;
};


/**
 * Tries to load the default layout.
 *
 * @param {Boolean} useCache Whether to use cache.
 * @param {Function} cb
 */
function loadDefaultLayout(useCache, cb) {
  if (!_options.defaultLayout) return cb();
  if (useCache && defaultLayoutTemplate) return cb(null, defaultLayoutTemplate);

  cacheLayout(_options.defaultLayout, useCache, function(err, template) {
    if (err) return cb(err);

    defaultLayoutTemplate = template;
    return cb(null, template);
  });
}


/**
 * express 3.x template engine compliance
 *
 * @param {String} filename Path to template file.
 * @param {Object} options
 * @param {Function} cb
 */
var _express3 = function(filename, options, cb) {
  var handlebars = exports.handlebars;


  /**
   * Allow a layout to be declared as a handlebars comment to remain spec compatible
   * with handlebars.
   *
   * Valid directives
   *
   *  {{!< foo}}                      # foo.hbs in same directory as template
   *  {{!< ../layouts/default}}       # default.hbs in parent layout directory
   *  {{!< ../layouts/default.html}}  # default.html in parent layout directory
   */
  function parseLayout(str, filename, cb) {
    var matches = str.match(layoutPattern);
    if (matches) {
      var layout = matches[1];

      // cacheLayout expects absolute path
      layout = path.resolve(path.join(path.dirname(filename), layout));
      cacheLayout(layout, options.cache, cb);
    }
    else {
      cb(null, null);
    }
  }


  /**
   * Renders `template` with an optional `layoutTemplate` using data in `locals`.
   */
  function render(template, locals, layoutTemplate, cb) {
    var res = template(locals);
    waiter.done(function(values) {
      Object.keys(values).forEach(function(id) {
        res = res.replace(id, values[id]);
      });

      if (!layoutTemplate) return cb(null, res);

      // layout declare a {{{body}}} placeholder into which a page is inserted
      locals.body = res;

      var layoutResult = layoutTemplate(locals);
      waiter.done(function(values) {
        Object.keys(values).forEach(function(id) {
          layoutResult = layoutResult.replace(id, values[id]);
        });

        cb(null, layoutResult);
      });
    });
  }


  /**
   * Compiles a file into a template and a layoutTemplate, then renders it above.
   */
  function compileFile(locals, cb) {
    var cached, template, layoutTemplate;

    // check cache
    cached = cache[filename];
    if (cached) {
      template = cached.template;
      layoutTemplate = cached.layoutTemplate;
      return render(template, locals, layoutTemplate, cb);
    }

    _options.provider.getTemplate(filename, function(err, str) {
      if (err) return cb(err);

      var template = handlebars.compile(str);
      if (options.cache) {
        cache[filename] = { template: template };
      }

      // Try to get the layout
      parseLayout(str, filename, function(err, layoutTemplate) {
        if (err) return cb(err);

        function renderIt(layoutTemplate) {
          if (layoutTemplate && options.cache) {
            cache[filename].layoutTemplate = layoutTemplate;
          }
          return render(template, locals, layoutTemplate, cb);
        }

        // Determine which layout to use
        //   1. Layout specified in template
        if (layoutTemplate) {
          renderIt(layoutTemplate);
        }

        //   2. Layout specified by options from render
        else if (typeof(options.layout) !== 'undefined') {
          if (options.layout) {
            var layoutFile = path.resolve(path.join(path.dirname(filename), options.layout));
            cacheLayout(layoutFile, options.cache, function(err, layoutTemplate) {
              if (err) return cb(err);
              renderIt(layoutTemplate);
            });

          }
          else {
            // if the value is falsey, behave as if no layout should be used - suppress defaults
            renderIt(null);
          }
        }

        //   3. Default layout specified when middleware was configured.
        else if (defaultLayoutTemplate) {
          renderIt(defaultLayoutTemplate);
        }

        // render without a template
        else renderIt(null);
      });
    });
  }


  /**
   * Loads partials if necessary
   * @param cb
   */
  function loadPartials(cb) {
    // Force reloading of all partials if caching is disabled.
    if (!options.cache) {
      cachePartials(cb);
    }
    else if (!partialsLoaded) {
      cachePartials(function(err) {
        if (err) return cb(err);
        partialsLoaded = true;
        cb();
      })
    }
  }


  /**
   * Loads layout (if any).
   */
  function loadLayout(cb) {
    loadDefaultLayout(options.cache, cb);
  }


  /**
   * Compiles and renders template.
   */
  var compileResult;
  function compile(cb) {
    compileFile(options, function(err, result) {
      if (err) return cb(err);
      compileResult = result;
      return cb();
    });
  }


  // process the template
  async.series([loadPartials, loadLayout, compile], function(err) {
    cb(err, compileResult);
  });
};


/**
 * Expose useful methods.
 */
exports.registerHelper = function() {
  exports.handlebars.registerHelper.apply(exports.handlebars, arguments);
};

exports.registerPartial = function() {
  exports.handlebars.registerPartial.apply(exports.handlebars, arguments);
};

exports.registerAsyncHelper = function(name, fn) {
  exports.handlebars.registerHelper(name, function(context) {
    return waiter.resolve(fn, context);
  });
};

// DEPRECATED, kept for backwards compatibility
exports.SafeString = exports.handlebars.SafeString;
exports.Utils = exports.handlebars.Utils;
