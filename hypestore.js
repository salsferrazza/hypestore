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
var mkdirp = require('mkdirp');

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


// TODO: HEAD and GET use same code until the point of reading media off storage
//     : Store MD5 of submitted request bodies?


// GET 
app.get("/:resource", function (req, res) {

    // TODO: filter for hypestore administrative pages (_ prefixed?)

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
app.put("*", function (req, res) {

    // TODO: 
    //
    // - map file extension to MIME
    // - validate known MIME types against client Accept header, 4xx Not Acceptable if no match
    // - handle hierarchical directory traversal

    var requestState = {};

    requestState.headers = req.headers;
    requestState.url = req.url;
    requestState.method = req.method;

    var file = config.storage.contentLocation + req.url;
    
    requestState.requestedFile = file;

    console.log("req.files: " + util.inspect(req.files));
    
    console.log("file to write to: " + file);
    //console.log("requestState: " + util.inspect(requestState));
    //console.log("contents of file: " + util.inspect(req));
    //console.log("content type: " + req.get('Content-Type'));

    // TODO: get path of ultimate resource that is being PUT 
    //     : check if path exists
    //     : if not, create with mkdirp, otherwise just persist the resource

    getRawBody(req, { length: req.headers['Content-Length'] }, function(err, buffer) {

	console.log("getRawBody callback, err: " + util.inspect(err) + ", buffer: " + util.inspect(buffer));
	
	if (err) {
	    
	    console.log("error getting raw body: " + util.inspect(err));
	    res.json(500, err);

	} else {
	    
	    console.log("processed request body, attempting to save as " + file);
	    
	    var parts = [];
	    
	    parts = requestState.url.split("/")
	    console.log("path split into " + parts.length + " parts");
	    var dirTree = config.storage.contentLocation + "/";
	    var resourceFile = {};

	    for (var i = 0; i < parts.length; i++) {
		
		// first splitee will always be empty
		if (i != 0) {

		    // if we're still in the the dir structure
		    if (i !== (parts.length - 1)) {

			dirTree += (parts[i] + "/");

		    } else {
		    	
			// this is the "file" or "resource" component of the path
			resourceFile = parts[i];
		    }
		    
		} 

	    }
	    
	    console.log("dirTree: " + dirTree);
	    console.log("resourceFile: " + resourceFile);

	    fs.exists(dirTree, function(exists) {

		if (!exists) {
		 
		    mkdirp(dirTree, function(err) {

			if (err) {
			    console.log("could not create directory: " + dirTree);
			    res.json(500, err);
			} else {

			    fs.writeFile(file, buffer, { flag: 'w' }, function (err) {
				
				if (err) {
				    console.log("error writing to file: " + file);
				    res.json(500, err);
				} else {
				    console.log("request body saved to " + file);
				    res.send(204);
				}
				
			    }); 

			}
			
		    });

		} else {

		    fs.writeFile(file, buffer, { flag: 'w' }, function (err) {
			
			if (err) {
			    console.log("error writing to file: " + file);
			    res.json(500, err);
			} else {
			    console.log("request body saved to " + file);
			    res.send(204);
			}
			
		    }); 

		}
		
	    });
	    
	}

    });

});


// DELETE
app.delete("/:resource", function (req, res) {

    res.send(204);

});

// POST -> should this even exist?  
app.post("/:resource", function (req, res) {

    // militant idempotency
    res.json(405, { message: "Hypestore is militantly idempotent and only supports the HTTP methods GET, PUT and DELETE" });

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

