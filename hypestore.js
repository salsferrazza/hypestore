// hypestore - HYPErmedia STORage Engine
//
// rfc2616 server supporting transparent content 
// storage and retrieval over HTTP
//
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
var events = require('events');

var SUPPORT = 'GET, HEAD, PUT, DELETE, OPTIONS';
var MIMEDEF = 'application/octet-stream';
var config;

app.use(express.logger());
app.use(express.cookieParser());
app.use(express.bodyParser());
app.use(function(req, res, next) {
    res.setHeader('X-Powered-By', 'HypeStore/0');
    res.setHeader('Accept-Ranges', 'bytes');
    next();
});
app.use(express.methodOverride());

var emitter = new events.EventEmitter();

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
    //       return a error 416 if upper range exceeds beyond length of file 
    // TODO: emit request entry 


    // see if a range is desired with If-Range
    // -> if so, check file stat, if modified after If-Range date or ETAG, send whole content w/ 200 OK
    // -> otherwise, check desired range and return

    let file = config.storage.contentLocation + decodeURIComponent(parseurl(req).pathname);

    if (!file) {
        res.send(400, 'Path is required');
        return;
    }

    let range = req.header('Range') ? req.header('Range').split(" ")[1] : "0-*";
    let rangeStart = range.split('-')[0];
    let rangeEnd = range.split('-')[1];

    fs.stat(file, function(err, stats) {
        if (!err) {
            const stream = fs.createReadStream(file, {
                start: parseInt(rangeStart),
                end: (rangeEnd === '*') ? stats.size : parseInt(rangeEnd)
            });
            let type = mime.lookup(file);
            res.set('Content-Type', type ? type : MIMEDEF);
            res.set('Content-Range', 'bytes ' + rangeStart + '-' + rangeEnd + '/' + stats.size);
            stream.pipe(res);
            return;
        } else {
            switch (err.code) {
                case 'ENOENT':
                    res.send(404, 'Not found');
                    return;
                default:
                    res.json(500, err);
                    return;
            }
        }
    });
});


// PUT 
app.put("*", function(req, res) {

    // resource name
    let file = config.storage.contentLocation + decodeURIComponent(parseurl(req).pathname);
    let exists = true;
    let len = req.headers['content-length'];

    fs.stat(file, function(err, stats) {

        if (err) {
            if (err.code === 'ENOENT') {
                exists = false;
            } else {
                res.json(500, err);
                return;
            }
        }

        if (!exists) {
            // run mkdirp to catch resource directory
        }

        getRawBody(req, {
            length: len
        }, function(err, buffer) {
            if (err) {
                res.json(500, err);
                return;
            } else {
                fs.writeFile(file, buffer, {
                    flags: 'w'
                }, function(err) {
                    if (err) {
                        res.json(500, err);
                        return;
                    } else {
                        res.send(exists ? 204 : 201);
                        return;
                    }
                });
            }
        });
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