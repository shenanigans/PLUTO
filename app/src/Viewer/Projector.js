
// var TerrainFragment = require ('./TerrainFragment');

function Projector (frame, planet, target, shaders) {
    this.frame = frame;
    this.planet = planet;
    this.target = target;
    this.canvas = target.canvas;
    this.shaders = shaders;
    this.document = target.canvas.ownerDocument;
    this.width = this.height = 0;

    this.refinements = [];

    this.shaders.programs.project.bind();
    this.shaders.programs.project.writeUniform ('resolution', planet.info.resolution);

    this.texture = target.createTexture();
}

Projector.prototype.setup = function(){
    var width = this.canvas.clientWidth;
    var height = this.canvas.clientHeight;
    if (this.width === width && this.height === height)
        return;
    this.width = width;
    this.height = height;
    this.canvas.setAttribute ('width', width);
    this.canvas.setAttribute ('height', height);
    this.setupFBO();
};

Projector.prototype.setupFBO = function (texture) {
    var target = this.target;
    target.bindTexture (target.TEXTURE_2D, this.texture);
    target.texParameteri (target.TEXTURE_2D, target.TEXTURE_WRAP_S, target.CLAMP_TO_EDGE);
    target.texParameteri (target.TEXTURE_2D, target.TEXTURE_WRAP_T, target.CLAMP_TO_EDGE);
    target.texParameteri (target.TEXTURE_2D, target.TEXTURE_MIN_FILTER, target.NEAREST);
    target.texParameteri (target.TEXTURE_2D, target.TEXTURE_MAG_FILTER, target.NEAREST);
    target.texImage2D (
        target.TEXTURE_2D,
        0,
        target.RGBA,
        this.width,
        this.height,
        0,
        target.RGBA,
        target.UNSIGNED_BYTE,
        null
    );
    if (!this.fbo) {
        this.fbo = target.createFramebuffer();
        target.bindFramebuffer (target.FRAMEBUFFER, this.fbo);
        target.framebufferTexture2D (
            target.FRAMEBUFFER,
            target.COLOR_ATTACHMENT0,
            target.TEXTURE_2D,
            this.texture,
            0
        );
        target.bindFramebuffer (target.FRAMEBUFFER, null);
    }
};

Projector.prototype.initialize = function (baseFragment, mode, config) {
    var target = this.target;
    baseFragment.prepareTarget (target);
    var program = this.shaders.programs.init[mode];
    program.bind();

    target.viewport (
        0,
        0,
        this.planet.info.resolution * 2 - 1,
        this.planet.info.resolution
    );
    program.writeAttribs (new Float32Array ([
       -180,  90,
       -180, -90,
        0,    90,
        0,   -90,
        180,  90,
        180, -90
    ]));

    // bind the base fragment's texture
    target.bindFramebuffer (target.FRAMEBUFFER, baseFragment.fbo);
    target.clearColor (0, 0, 0, 0);
    target.clear (target.COLOR_BUFFER_BIT);
    target.drawArrays (target.TRIANGLE_STRIP, 0, 6);

    // un-bind the base fbo
    target.bindFramebuffer (target.FRAMEBUFFER, null);
};

Projector.prototype.draw = function (frags) {
    this.setup();
    var target = this.target;
    var program = this.shaders.programs.project;
    program.bind();
    target.bindFramebuffer (target.FRAMEBUFFER, this.fbo);
    target.viewport (0, 0, target.canvas.width, target.canvas.height);
    target.clear (target.COLOR_BUFFER_BIT);

    // frame and viewport uniforms
    program.writeUniform ('frame', [
        (target.canvas.width  * this.frame.degreesPerPixel) / 2,
        (target.canvas.height * this.frame.degreesPerPixel) / 2
    ]);
    program.writeUniform ('frame_center', [
        this.frame.center.x,
        this.frame.center.y
    ]);
    program.writeUniform ('altitude', this.frame.altitude);
    program.writeUniform ('resolution', this.planet.info.resolution);
    program.writeUniform ('viewportSize', [
        target.canvas.width,
        target.canvas.height
    ]);

    var drawTerrainFragment = function (container) {
        // bind texture to tex unit and configure shader uniforms
        container.bind (target, program, 0);

        // process northern projection
        var length = this.frame.projection.north.length * 2;
        var points = new Float32Array (length * 2);
        var start = new Float32Array (length);
        var end = new Float32Array (length);
        var isRisingArr = new Float32Array (length);

        // this will be called twice per TerrainFragment
        // once each for northern and southern sinusoids
        function finalDraw(){
            program.writeAttribs (points, start, end)
            target.drawArrays (target.TRIANGLE_STRIP, 0, length);
        }

        // initialize first two northern points
        points[0] = points[2] = -180;
        points[1] = 90;
        points[3] = 0;
        start[0] = start[1] = -180;
        end[0] = end[1] = this.frame.projection.north[1];
        isRisingArr[0] = isRisingArr[1] = true;
        // process remaining northern points
        var i=2;
        var isRising = true;
        for (var j=this.frame.projection.north.length * 2; i<j; i++) {
            var dbl = i * 2;
            var half = Math.floor(i/2);
            points[dbl] = this.frame.projection.north[half];
            points[dbl+1] = i % 2 ? 0 : 90;
            isRisingArr[i] = isRising;
            start[i] = this.frame.projection.north[Math.floor (i/2)-1];
            end[i] = this.frame.projection.north[Math.floor (i/2)];
            if (!((i+1)%2)) isRising = !isRising;
        }

        // isRising
        // handled separately from the other uniforms
        // because it's always the same for north and south
        program.writeAttribs (null, null, null, isRisingArr);
        finalDraw.call (this);

        // process southern projection
        // initialize first two southern points
        points[0] = points[2] = -180;
        points[1] = -90;
        points[3] = 0;
        start[0] = start[1] = -180;
        end[0] = end[1] = this.frame.projection.south[1];
        // process remaining southern points
        for (var j=2,l=length*2; i<l; i++,j++) {
            var dbl = j * 2;
            var half = Math.floor(j/2);
            var value = this.frame.projection.south[half];
            points[dbl] = value;
            points[dbl+1] = j % 2 ? 0 : -90;
            start[j] = this.frame.projection.south[Math.floor (j/2)-1];
            end[j] = this.frame.projection.south[Math.floor (j/2)];
        }

        finalDraw.call (this);
    }.bind (this);


    // draw every frag!
    for (var i=0,j=frags.length; i<j; i++)
        drawTerrainFragment (frags[i]);

    // draw each relevant TerrainFragment

    // release our FBO
    target.bindFramebuffer (target.FRAMEBUFFER, null);
};

module.exports = Projector;
