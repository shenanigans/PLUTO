
var Projector = require ('./Projector');
var shaders = require ('./shaders');

function Viewer (planet, canvas, frame) {
    this.planet = planet;
    this.canvas = canvas;
    this.frame = frame;
    this.document = canvas.ownerDocument;

    this.mode = 'gray';
    // this.mode = 'raw';

    var target = this.target = canvas.getContext ('webgl2');
    target.clearColor (0, 0, 0, 0);
    target.enable (target.BLEND);
    target.disable (target.DEPTH_TEST);
    target.blendFuncSeparate (
        target.SRC_ALPHA,
        target.ONE_MINUS_SRC_ALPHA,
        target.ONE,
        target.ONE_MINUS_SRC_ALPHA
    );
    this.shaders = shaders.compile (target);
    this.mainProjector = new Projector (frame, planet, target, this.shaders);

    // set up settings controls
    this.settingsElem = this.document.getElementById ('ViewerSettings');
    this.seaLevelSettingsElem = this.document.getElementById ('SeaLevelSettings');

    var modeSelector = this.settingsElem.lastElementChild;
    this.settingsPanes = {
        grayscale:      this.document.createElement ('div'),
        topographic:    this.document.createElement ('div'),
        psychadelic:    this.document.createElement ('div'),
        raw:            this.document.createElement ('div')
    };
}

var POINTS = new Float32Array ([
    -1,  1,
    -1, -1,
     1,  1,
     1, -1
]);
var TEXTURE_POINTS = new Float32Array ([
     0,  1,
     0,  0,
     1,  1,
     1,  0
]);
Viewer.prototype.draw = function(){
    var target = this.target;

    // fetch the currently visible TerrainFragments
    // var frags = this.planet.getFragments (this.frame);
    var frags = [ this.planet.baseFragment ];
    // ensure all frags are properly bound to the editor context
    for (var i=0,j=frags.length; i<j; i++)
        frags[i].prepareTarget (target);

    // render all active Projectors
    this.mainProjector.draw (frags);

    // visualize terrain to screen
    var program = this.shaders.programs.visualize[this.mode];
    program.bind();
    program.writeAttribs (POINTS, TEXTURE_POINTS);
    target.activeTexture (target.TEXTURE0);
    target.bindTexture (target.TEXTURE_2D, this.mainProjector.texture);
    program.writeUniform ('image', 0);
    target.drawArrays (target.TRIANGLE_STRIP, 0, 4);
};

module.exports = Viewer;
