var express = require('express');
var fs = require('fs');

var app = express();

var path = require('path');
var server = require('http').createServer(app);
var util = require('util');

var spawn = require('child_process').spawn;

app.use(express.static(__dirname + '/static'));
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(express.logger());
app.use(express.cookieParser());
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.session({ secret: 'keyboard cat' }));
app.use(express.static(__dirname + '/public'));

var config = loadConfig();

if (!config) {
    console.log("FATAL: No config, exiting.");
} else {
 
    // TODO: check content directory exists
    console.log("found config: " + util.inspect(config));
    server.listen(config.port);
    console.log("Listening on port: " + config.port);
}

// GET 
app.get("/:url", function (req, res) {

    console.log("req: " + util.inspect(req));

    var requestState = {};

    requestState.headers = req.headers;
    requestState.url = req.url;
    requestState.method = req.method;

    var file;
    if (!req.params.url) {
	file = config.storage.contentLocation + "/index.html";
    } else {
	file = config.storage.contentLocation + req.params.url;
    }
    
    fs.readFile(file, function (err, data) {
	
	if (err) {
	    console.log("error opening file: " + file + ": " + util.inspect(err));
	    
	    if (err.errno == 34) { // No such file or directory
		res.send(404, file); 
	    } else {
		res.send(500, util.inspect(err));
	    }

	} else {
	    console.log("found data in " + file);
	    res.send(200, data);
	}

    });
});

function loadConfig() {
    console.log("Loading configuration for " + "./config.json");
    if (fs.existsSync("./config.json")) {
	var cfg = fs.readFileSync("./config.json", 'utf-8');
	return JSON.parse(cfg);
    } else {
	console.log("loadConfig: no config.json found");
	return undefined;
    }
}

