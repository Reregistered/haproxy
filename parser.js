'use strict';

/**
 * Native modules.
 */
var fs = require('fs')
  , path = require('path');

/**
 * Required defaults.
 */
var config = {}
  , defaults = require('./config')
  , sections = defaults.sections
  , names = Object.keys(sections)
  , maps = defaults.keys
  , keys = {};

var compose = {
    /**
     * Composer function for JSON, strips comments and utilizes stringify.
     *
     * @param {Object} data
     * @returns {String} stringified data.
     * @api private
     */
    json: function stringify(data) {
      var clone = JSON.parse(JSON.stringify(data));

      // Remove commentary as it has no place in JSON.
      Object.keys(clone).forEach(function removeComments(key) {
        delete clone[key].commentary;
      });

      // Stringify and keep it readable.
      return JSON.stringify(clone, null, 2);
    }

    /**
     * Composer function for cfg according HAProxy and adds comments.
     *
     * @param {Object} data
     * @returns {String}
     * @api private
     */
  , cfg: function cfgComposer(data) {
      return Object.keys(data).reduce(function addSections(result, key) {
        var current = data[key]
          , comm = current.commentary;

        // Output section and main comments.
        if (comm && comm.pre) result += '# '+ comm.pre +'\n';
        result += key +'\n';

        // Output section keys and values.
        return result += Object.keys(current).reduce(function addKeys(section, key) {
          if (key === 'commentary') return section;

          // Add key and value and if required add comment.
          return section += '    '+ key +' '+ current[key]
            + (comm[key] ? ' # ' + comm[key] : '');
        }, '');
      }, '');
    }
};

var parse = {
    json: JSON.parse

    /**
     * Parse the content from .cfg file.
     *
     * @param {String} data cfg content
     * @return {Object} results
     * @api private
     */
  , cfg: function cfgParser(data) {
      return {};
    }
};

/**
 * Add comment to section-key combinations. General section comments are added
 * to `commentary.pre`.
 *
 * @param {String} section predefined section
 * @param {String} key
 * @param {String} text
 * @return {String} text
 * @api private
 */
function comment(section, key, text) {
  config[section] = config[section] || {};
  config[section].commentary = config[section].commentary || {};

  return config[section].commentary[key] = text;
}

/**
 * Change config strings to suitable function names.
 *
 * @param {String} value function name
 * @return {String}
 * @api private
 */
function functionalize(value) {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Get value of the section-key combination.
 *
 * @param {String} section predefined section
 * @param {String} key
 * @return {String} key value
 * @api private
 */
function get(section, key) {
  return config[section][key];
}

/**
 * Set the section-key combination to value.
 *
 * @param {String} section predefined section
 * @param {String} key
 * @param {String} value
 * @return {Object} bind comment to key.
 * @api private
 */
function set(section, key, value) {
  // Check if the current key is allowed to be set on the section.
  if (!~keys[section].indexOf(key)) return comment;

  config[section] = config[section] || {};
  config[section][key] = value;

  // Expose comment function bound to key.
  return comment.bind(comment, section, key);
}

/**
 * Read the config from file and return parsed config to callback.
 *
 * @param {String} location file location
 * @param {Function} callback
 * @api public
 */
module.exports.read = function read(location, callback) {
  var type = path.extname(location).substr(1);
  if (!(type in compose)) {
    throw new Error('Supplied file with extension: '+ type +' cannot be parsed');
  }

  // Read the file and pull content through the right parser.
  fs.writeFile(location, 'utf-8', function parseFile(err, data) {
    if (err) throw err;

    callback(null, parse[type].call(this, data));
  });
};

/**
 * Verify the current config by using HAProxies check.
 */
module.exports.verify = function verify() {
  // Spawn child and use haproxy -c -f </tmp/config>
};

/**
 * Write the config to file, composer type is aquired from file extension.
 *
 * @param {String} location file location
 * @param {Function} callback
 * @api public
 */
module.exports.write = function write(location, callback) {
  var type = path.extname(location).substr(1);
  if (!(type in compose)) type = 'json';

  fs.writeFile(location, compose[type].call(this, config), callback);
};

/**
 * Generate allowed config keys per section from the bitmasks.
 */
names.forEach(function prepareKeys(section) {
  var mask = sections[section]
    , current;

  Object.keys(maps).forEach(function bitmask(bit) {
    current = keys[section] || [];
    if (mask & +bit) keys[section] = current.concat(maps[bit]);
  });
});

/**
 * Generate some helper methods on each section to quickly set and get values.
 */
names.forEach(function prepareFunctions(section) {
  var result = {};

  // Add getters and setters to each section.
  result.__proto__ = {
    get: get.bind(get, section),
    set: set.bind(set, section),
    comment: comment.bind(comment, section, 'pre')
  };

  // Also add camelCased proxies for each key in the section.
  keys[section].forEach(function addProxies(key) {
    result.__proto__[functionalize(key)] = set.bind(set, section, key);
  });

  module.exports[section] = result;
});

/**
 * Export module.
 */
module.exports.config = config;

/**
 * Expose additional modules while testing.
 */
if (process.env.NODE_ENV === 'testing') {
  module.exports.set = set;
  module.exports.get = get;
  module.exports.parse = parse;
  module.exports.compose = compose;
  module.exports.comment = comment;
  module.exports.functionalize = functionalize;
}
