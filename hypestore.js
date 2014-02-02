// hypestore - HYPErtext STORage Engine
//
// rfc2616 server supporting transparent content 
// storage and retrieval over HTTP

var express = require('express');
var fs = require('fs');

var app = express();

var path = require('path');
var server = require('http').createServer(app);
var util = require('util');
var getRawBody = require('raw-body');

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
    console.log("FATAL: No config.json in current directory, exiting.");
} else {
 
    fs.exists(config.storage.contentLocation, function (exists) {

	if (exists) {
	    console.log("found content directory " + config.storage.contentLocation);
	    server.listen(config.port);
	    console.log("Listening on port: " + config.port);
	} else {
	    console.log("WARNING: location " + config.storage.contentLocation + " specified in config.json could not be found.  Trying to create...");
	    
	    fs.mkdir(config.storage.contentLocation, function (exception) {

		if (exception) {
		    console.log("FATAL: Could not create directory " + config.storage.contentLocation);
		} else {
		    console.log("created directory " + config.storage.contentLocation);
		    server.listen(config.port);
		    console.log("Listening on port: " + config.port);
		}
		
	    });

	}
    
    });
}

// GET 
app.get("/:resource", function (req, res) {

    console.log("req: " + util.inspect(req));

    var requestState = {};

    requestState.headers = req.headers;
    requestState.url = req.url;
    requestState.method = req.method;

    var file;
    if (req.params.resource == undefined) {
	file = config.storage.contentLocation + "/index.html";
    } else {
	file = config.storage.contentLocation + "/" + req.params.resource;
    }

    requestState.requestedFile = file;
    
    console.log("requestState: " + requestState);

    fs.readFile(file, function (err, data) {
	
	if (err) {
	    console.log("error opening file: " + file + ": " + util.inspect(err));
	    
	    if (err.errno == 34) { // No such file or directory
		requestState.responseCode = 404;
		res.json(404, requestState); 
	    } else {
		res.json(500, err);
	    }

	} else {
	    console.log("found data in " + file);
	    
	    console.log("\n\n" + util.inspect(data));

	    // TODO:

	    // lookup content type of file from original submission
	    // set content-type header
	    	    
	    res.send(200, data);

	}

    });

});

// PUT 
app.put("/:resource", function (req, res) {

    // TODO: 
    //
    // - map file extension to MIME
    // - validate known MIME types against client Accept header, 4xx Not Acceptable if no match
    // - handle hierarchical directory traversal

    var requestState = {};

    requestState.headers = req.headers;
    requestState.url = req.url;
    requestState.method = req.method;

    var file;
    if (!req.params.resource) {
	file = config.storage.contentLocation + "/index.html";
    } else {
	file = config.storage.contentLocation + "/" + req.params.resource;
    }

    requestState.requestedFile = file;

    console.log("requestState: " + util.inspect(requestState));
    console.log("contents of file: " + util.inspect(req));
    console.log("content type: " + req.get('Content-Type'));

    getRawBody(req, { length: req.headers['Content-Length'] }, function(err, buffer) {

	if (err) {
	    
	    console.log("error getting raw body: " + util.inspect(err));
	    res.json(500, err);

	} else {

	    // TODO: write buffer to file

	    fs.writeFile(file, buffer, { flag: 'w' }, function (err) {
		
		if (err) {
		    console.log("error writing to file: " + file);
		    res.json(500, err);
		} else {
		    res.send(204);
		}
		
	    });
	    
	}

    });

});

// POST -> should this even exist?  
app.post("/:resource", function (req, res) {


    // TODO:

    // open file for writing 


    res.json(405, { message: "Hypestore supports HTTP methods: GET, PUT, DELETE" });

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

