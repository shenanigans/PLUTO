
function TerrainFragment (planet, fragment) {
    this.planet = planet;
    this.fragment = fragment;

    this.frame = fragment.frame || [ 90, 180, -90, -180 ];
    this.center = [ (this.frame[1] + this.frame[3]) / 2, (this.frame[0] + this.frame[2]) / 2 ];
    this.altitude = fragment.altitude;

    this.listeners = [];
    this.textures = new Map();

    this.degreesPerPixel = 180 / (planet.info.resolution * this.altitude);
    this.width = Math.round ((this.frame[1] - this.frame[3]) / this.degreesPerPixel);
    this.height = Math.round ((this.frame[0] - this.frame[2]) / this.degreesPerPixel);

    // network fetch?
    if (fragment._id) {
        // fetch image data from server by id
    }
}

TerrainFragment.prototype.ondata = function (fn) {
    this.listeners.push (fn);
    if (this.hasData)
        process.nextTick (fn);
};

TerrainFragment.prototype.removeListener = function (fn) {
    var i = this.listeners.indexOf (fn);
    if (i >= 0)
        this.listeners.splice (i, 1);
};

TerrainFragment.prototype.emit = function(){
    this.hasData = true;
    for (var i=0,j=this.listeners.length; i<j; i++)
        this.listeners[i]();
};

TerrainFragment.prototype.sendDataToGPU = function (buff) {

};

TerrainFragment.prototype.getDataFromGPU = function(){

};

TerrainFragment.prototype.prepareTarget = function (target) {
    // we'll call this frequently just to check that fragments are ready on a given target
    if (this.textures.get (target))
        return;

    var texture = target.createTexture();
    target.bindTexture (target.TEXTURE_2D, texture);
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
    this.fbo = target.createFramebuffer();
    target.bindFramebuffer (target.FRAMEBUFFER, this.fbo);
    target.framebufferTexture2D (
        target.FRAMEBUFFER,
        target.COLOR_ATTACHMENT0,
        target.TEXTURE_2D,
        texture,
        0
    );
    target.bindFramebuffer (target.FRAMEBUFFER, null);

    this.textures.set (target, texture);
};

TerrainFragment.prototype.bind = function (target, program, textureUnit) {
    target.activeTexture (target['TEXTURE'+textureUnit]);
    target.bindTexture (target.TEXTURE_2D, this.textures.get (target));
    program.writeUniform ('texture_frame', this.frame);
    program.writeUniform ('texture_altitude', this.altitude);

    var degreesPerTexel = 180 / ((this.planet.info.resolution * this.altitude) - 1);
    var horizontalTexels = (this.frame[1] - this.frame[3]) / degreesPerTexel;
    var verticalTexels = (this.frame[0] - this.frame[2]) / degreesPerTexel + 1;
    program.writeUniform ('degreesPerTexel', degreesPerTexel);
    program.writeUniform ('horizontalTexels', horizontalTexels);
    program.writeUniform ('verticalTexels', verticalTexels);
    program.writeUniform (
        'texture_zeroOffset',
        Math.round (this.center[0] / degreesPerTexel) - Math.ceil (horizontalTexels / 2)
    );
};

/*
    Update fragment information after its FBO has been modified.
*/
TerrainFragment.prototype.acceptFBO = function(){

};

module.exports = TerrainFragment;
