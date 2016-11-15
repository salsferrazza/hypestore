// hypestore - HYPErmedia STORage Engine
//
// rfc2616 server supporting transparent content 
// storage and retrieval over HTTP
// TODO: Store MD5 of submitted request bodies?
// TODO: filter for hypestore administrative pages (_ prefixed?)
var express = require('express');
var fs = require('fs');
var app = express();
var path = require('path');
var server = require('http').createServer(app);
var util = require('util');
var getRawBody = require('raw-body');
var mkdirp = require('mkdirp');
var mime = require('mime-types');
var spawn = require('child_process').spawn;

var SUPPORT = 'GET, HEAD, PUT, DELETE, OPTIONS'
var config;

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

app.use(express.static(__dirname + '/static'));
app.use(express.logger());
app.use(express.cookieParser());
app.use(express.bodyParser());
app.use(function(req, res, next) {
    res.setHeader('X-Powered-By', 'HypeStore/0');
    next();
});
app.use(express.methodOverride());

init(); // read config and start server

// HTTP method definitions
//
// HEAD

app.head("*", function(req, res) {

    let file = config.storage.contentLocation + req.url;
    let resource = file.split('/')[file.split('/').length - 1];

    if (file) {
        fs.stat(file, function(err, stats) {
            if (err) {
                res.json(500, err);
                return;
            } else {

                let type = mime.lookup(file);
                res.set('Content-Length', stats.size);
                res.set('Content-Type', type ? type : 'application/octet-stream');
                res.send(200);
                return;
            }
        });

    } else {
        res.send(404);
        return;
    }
});

// GET 
app.get("*", function(req, res) {

    // TODO: Add support for Range header
    //       file reader should take no Range header as a request for byte range 0-<size of file>
    //       return a error 416 if upper range exceeds beyond length of file 

    var requestState = {};

    requestState.headers = req.headers;
    requestState.url = req.url;
    requestState.method = req.method;

    let file = config.storage.contentLocation + req.url;
    let resource = file.split('/')[file.split('/').length - 1];

    if (!file) {
        console.log("no resource specified, should send index media");
        file = config.storage.contentLocation + req.url + config.storage.indexFile;
    }

    fs.readFile(file, function(err, data) {

        if (err) {

            console.log("error opening file: " + file + ": " + util.inspect(err));

            if (err.errno == -2) { // ENOENT: No such file or directory
                res.send(404);
                return;
            } else {
                res.json(500, err);
                return;
            }

        } else {
            let type = mime.lookup(file);
            console.log("found data in " + file);
            res.set('Content-Type', type ? type : 'application/octet-stream');
            res.send(200, data);
            return;
        }

    });

});

// PUT 
app.put("*", function(req, res) {

    // TODO: 
    //
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

    getRawBody(req, {
        length: req.headers['Content-Length']
    }, function(err, buffer) {

        // console.log("getRawBody callback, err: " + util.inspect(err) + ", buffer: " + util.inspect(buffer));

        if (err) {

            console.log("error getting raw body: " + util.inspect(err));
            res.json(500, err);

        } else {

            // TODO: refactor below code to url2resource(url, function(filehandle)) function
            //     : that takes in req.url and returns a filehandle or undefined to the callback.

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
            var httpResponseCode = {};

            fs.exists(dirTree, function(exists) {

                if (!exists) {

                    httpResponseCode = 201;
                    mkdirp(dirTree, function(err) {

                        if (err) {
                            console.log("could not create directory: " + dirTree);
                            res.json(500, err);
                            return;
                        }

                    });

                }

                fs.exists(dirTree + "/" + resourceFile, function(exists) {
                    httpResponseCode = exists ? 204 : 201;
                });

                fs.writeFile(file, buffer, {
                    flag: 'w'
                }, function(err) {

                    if (err) {
                        console.log("error writing to file: " + file);
                        res.json(500, err);
                        return;
                    } else {
                        console.log("request body saved to " + file);
                        res.send(httpResponseCode);
                        return;
                    }

                });
            });
        }

    });
});


// DELETE
app.delete("*", function(req, res) {

    var file = config.storage.contentLocation + req.url;

    fs.exists(file, function(exists) {

        if (exists) {

            fs.unlink(file, function(error) {

                if (error) {
                    res.json(500, error);
                    return;
                } else {
                    res.send(204);
                    return;
                }

            });

        } else {
            res.send(404);
            return;
        }

    });

});

// POST -> should this even exist?  
app.post("*", function(req, res) {
    res.set('Allow', SUPPORT);
    res.json(405, {
        message: "Hypestore is militantly idempotent and only supports HEAD, GET, PUT and DELETE"
    });
    return;
});

app.options("*", function(req, res) {
	res.set('Allow', SUPPORT);
	res.send(200);
	return;
});

function loadConfig() {
    console.log("loading configuration for " + "./config.json");
    if (fs.existsSync("./config.json")) {
        var config = fs.readFileSync("./config.json", 'utf-8');
        return JSON.parse(config);
    } else {
        console.log("loadConfig: no ./config.json found");
        return undefined;
    }
}

function init() {

    config = loadConfig();
    if (!config) {
        console.log("FATAL: No config.json in current directory, exiting.");
        process.exit(1);
    }
    fs.exists(config.storage.contentLocation, function(exists) {
        if (!exists) {
            console.log("WARNING: location " + config.storage.contentLocation + " specified in config.json could not be found.  Trying to create...");
            fs.mkdir(config.storage.contentLocation, function(exception) {
                if (exception) {
                    console.log("FATAL: Could not create directory " + config.storage.contentLocation);
                    process.exit(exception);
                }
            });
        }
    });

    try {
        server.listen(config.port);
        console.log('hypestore listening on port ' + config.port);
    } catch (error) {
        console.error('Could not bind port ' + config.port);
        process.exit(error);
    }

}