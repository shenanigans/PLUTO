
var Tool = require ('./Tool');
var TissotCursor = require ('./TissotCursor');
var NumberInput = require ('NumberInput');
var util = require ('util');

var RADIUS_INITIAL = 30;

function DevBrush(){
    Tool.apply (this, arguments);

    this.radius = RADIUS_INITIAL;

    var self = this;
    this.subscribe ('cursor', function (sourceName, x, y) {
        self.draw();
    });

    this.subscribe ('brush_up', function(){
        self.radius++;
        self.draw();
    });
    this.subscribe ('brush_down', function(){
        self.radius--;
        self.draw();
    });

    this.subscribe ('paint', function (sourceName, pressure, lng, lat, dLng, dLat) {
        console.log ('brush paint');
    });

    // props bar setup
    this.radiusInput = new NumberInput ('Radius', this.document, {
        value:      this.radius,
        width:      90
    }, function (radius) {
        var newRadius = Math.max (2, Math.min (self.planet.info.resolution, radius));
        if (newRadius !== radius)
            self.radiusInput.set (newRadius);
        self.radiius = newRadius;
        self.draw();
    });
    this.propsBar.appendChild (this.radiusInput.elem);
}
util.inherits (DevBrush, Tool);
DevBrush.prototype.info = {
    title:      "Simple Brush Tool - initial dev implementation",
    id:         "devbrush"
};

DevBrush.prototype.start = function (planet) {
    Tool.prototype.start.call (this, planet);

    this.setCursor ('precision', 'longitude');
};

DevBrush.prototype.draw = function (frame) {
    this.context.clearRect (0, 0, this.canvas.width, this.canvas.height);

    this.context.fillStyle = this.editor.styles.editor.tools.normal;
    this.context.strokeStyle = this.editor.styles.editor.tools.normal;

    TissotCursor (this.context, this.frame, this.editor.cursor, this.radius);
};

DevBrush.prototype.paint = function (dLong, dLat) {

};

module.exports = DevBrush;

