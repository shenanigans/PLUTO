
var EventEmitter = require ('events').EventEmitter;
var util = require ('util');
var TerrainFragment = require ('./TerrainFragment');

var SERVICE_URL = 'http://pluto.kaztl.com/tex';
var DEFAULT_SIZE = 0.25;

function Planet (info, init) {
    EventEmitter.call (this);
    this.info = info;

    this.fragments = {};

    var baseFragmentDoc = { altitude:1, frame:[ 90, 180, -90, -180 ] };
    if (this.info.base)
        baseFragmentDoc._id = this.info.base;
    this.baseFragment = new TerrainFragment (this, baseFragmentDoc);
}

this.fragments = {};
this.novelFragments = [];
util.inherits (Planet, EventEmitter);

/*
    Ask the server for all the current fragments in a given area. Cached fragments will be returned
    in an Array. Fragments loaded from the server will be emitted as events.
*/
Planet.prototype.getFragments = function (frame) {
    var frags = [ this.baseFragment ];

    return frags;
};

Planet.prototype.newFragment = function (center, altitude) {
    var degreesPerPixel = 180 / (this.info.resolution * altitude);
    var size = Math.floor (DEFAULT_SIZE * this.info.resolution);
    var frame = [
        Math.min (90, center[1] + size * degreesPerPixel),
        center[0] + size * degreesPerPixel,
        Math.max (-90, center[1] - size * degreesPerPixel),
        center[0] - size * degreesPerPixel
    ];
};

/*
    Save changes to the Planet definition to the server.
*/
Planet.prototype.commit = function (info, callback) {

};

module.exports = Planet;
