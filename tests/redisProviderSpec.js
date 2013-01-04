var async = require('async');
var hbs = require('..');
var redis = require('redis');
var request = require('supertest');
var express = require('express');
var RedisProvider = require('../contrib/providers/redis');

var app = express();
var client = redis.createClient();


/**
 * Seed templates.
 */
function seedTemplates(cb) {
  var templates = {
    // partials are stored with prefix `hbsp:` (configurable through RedisProvider constructor)
    'hbsp:scripts': '<script src="jquery.js"></script>',

    // templates and layouts are stored with prefix `hbst:`
    'hbst:mainLayout': '<html><head><title>{{title}}</title>{{> scripts}}</head><body>{{{body}}}</body></html>',
    'hbst:fruitLayout': '<html><head><title>{{title}}</title>{{> scripts}}</head><body>{{{body}}}</body>{{{block "fruit"}}}</html>',
    'hbst:index': '<h1>Front page</h1>',
    'hbst:fruit': '{{#contentFor "fruit"}}<h2>{{fruit}}</h2>{{/contentFor}}'
  };

  function setKey(key, cb) {
    client.set(key, templates[key], cb);
  }
  async.forEach(Object.keys(templates), setKey, cb);
}


/**
 * Configures express app.
 */
function configureHbs() {
  var provider = new RedisProvider({redis: client});

  // Hook in express-hbs and tell it where partials are found
  app.engine('hbs', hbs.express3({provider: provider, defaultLayout: 'mainLayout'}));
  app.set('view engine', 'hbs');
  app.set('views', '');
}


describe('Redis Template Provider', function() {

  before(function(done) {
    seedTemplates(function(err) {
      if (err) return done(err);
      configureHbs();
      done();
    });
  });

  it('should use defaultLayout', function(done) {
    app.get('/', function(req, res) {
      res.render('index', {
        title: 'redis example'
      });
    });

    request(app)
      .get('/')
      .expect(/Front page/)
      .expect(/<title>redis example<\/title>/, done);
    done();
  });

  it('should use layout passed with locals', function(done) {
    app.get('/fruit', function(req, res) {
      res.render('fruit', {
        fruit: 'orange',
        title: 'fruit example',
        layout: 'fruitLayout'
      });
    });

    request(app)
      .get('/fruit')
      .expect(/<h2>orange<\/h2>/)
      .expect(/<title>fruit example<\/title>/, done);
    done();
  });
});
