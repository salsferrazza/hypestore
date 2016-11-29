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
var parseurl = require('parseurl');
var resolvePath = require('resolve-path');
var spawn = require('child_process').spawn;

var SUPPORT = 'GET, HEAD, PUT, DELETE, OPTIONS';
var MIMEDEF = 'application/octet-stream';
var config;

app.use(express.logger());
app.use(express.cookieParser());
app.use(express.bodyParser());
app.use(function(req, res, next) {
    res.setHeader('X-Powered-By', 'HypeStore/0');
    next();
});
app.use(express.methodOverride());

init(); // read config and start server

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
                res.set('Content-Type', type ? type : MIMEDEF);
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

    let file = config.storage.contentLocation + decodeURIComponent(parseurl(req).pathname);

    if (!file) {
        res.send(400, 'Path is required');
        return;
    }

    fs.readFile(file, function(err, data) {

        if (err) {
            console.error("could not open file: " + file + ": " + util.inspect(err));
            if (err.errno == -2) { // ENOENT: No such file or directory
                res.json(404, err);
                return;
            } else {
                res.json(500, err);
                return;
            }

        } else {
            let type = mime.lookup(file);
            res.set('Content-Type', type ? type : MIMEDEF);
            res.send(200, data);
            return;
        }

    });

});

// PUT 
app.put("*", function(req, res) {

    let file = config.storage.contentLocation + decodeURIComponent(parseurl(req).pathname);

    getRawBody(req, {
        length: req.headers['Content-Length']
    }, function(err, buffer) {
        if (err) {
            console.log("error getting raw body: " + util.inspect(err));
            res.json(500, err);
            return;
        } else {
            let parts = [];
            parts = req.url.split("/")
            console.log("path split into " + parts.length + " parts");
            let dirTree = config.storage.contentLocation + "/";
            let resourceFile;

            for (let i = 0; i < parts.length; i++) {
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

            let httpResponseCode;
            fs.exists(dirTree, function(exists) {
                if (!exists) {
                    httpResponseCode = 201;
                    mkdirp(dirTree, function(err) {
                        if (err) {
                            console.error("could not create directory: " + dirTree);
                            res.json(500, err);
                            return;
                        } else {
                            fs.exists(dirTree + "/" + resourceFile, function(exists) {
                                httpResponseCode = exists ? 204 : 201;
                                fs.writeFile(file, buffer, {
                                    flag: 'w'
                                }, function(err) {
                                    if (err) {
                                        res.json(500, err);
                                        return;
                                    } else {
                                        res.send(httpResponseCode);
                                        return;
                                    }
                                });
                            });
                        }
                    });
                }
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
        message: "Hypestore is militantly idempotent and only supports " + SUPPORT
    });
    return;
});

app.options("*", function(req, res) {
    res.set('Allow', SUPPORT);
    res.send(200);
    return;
});

// return the contents of a particular file within the specified range
function fileData(file, rangeStart, rangeEnd, cb) {

    

}

function loadConfig() {
    if (fs.existsSync("./config.json")) {
        var config = fs.readFileSync("./config.json", 'utf-8');
        return JSON.parse(config);
    } else {
        console.error("loadConfig: no ./config.json found");
        return undefined;
    }
}

function init() {

    config = loadConfig();
    if (!config) {
        console.error("FATAL: No config.json in current directory, exiting.");
        process.exit(1);
    }
    fs.exists(config.storage.contentLocation, function(exists) {
        if (!exists) {
            console.warn("WARNING: location " + config.storage.contentLocation + " specified in config.json could not be found.  Trying to create...");
            fs.mkdir(config.storage.contentLocation, function(exception) {
                if (exception) {
                    console.error("FATAL: Could not create directory " + config.storage.contentLocation);
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