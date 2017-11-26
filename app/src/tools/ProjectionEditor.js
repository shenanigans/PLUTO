
var StringInput = require ('StringInput');
var NumberInput = require ('NumberInput');
var Buttonize = require ('Buttonize');
var Shmath = require ('Shmath');
var Tool = require ('./Tool');
var util = require ('util');

var SINUSES = [ 'north', 'south' ];
var MIN_SINUS_GAP = 15;

global.ACTION_PROJECTION_CREATE         = Symbol ("created new Projection");
global.ACTION_PROJECTION_DELETE         = Symbol ("deleted Projection");
global.ACTION_PROJECTION_RENAME         = Symbol ("changed title");
global.ACTION_PROJECTION_POINT_MOVE     = Symbol ("moved control point");
global.ACTION_PROJECTION_POINT_ADD      = Symbol ("added control point");
global.ACTION_PROJECTION_POINT_DELETE   = Symbol ("deleted control point");

function ProjectionEditor(){
    Tool.apply (this, arguments);

    this.cursorMode = 'drag';

    var self = this;
    // add/remove section actions
    this.subscribe ('click', function (isDown) {
        console.log ('click?', self.cursorMode);
        if (self.cursorMode === 'drag') {
            self.selectPoint (undefined, false);
            self.draw();
            return;
        }
        if (self.cursorMode !== 'create')
            return;
        // add a new "peak" as close to the cursor's present longitude as possible
        var newPeak = self.cursor.equatorialLongitude;
        var projection = self.cursor.latitude >= 0 ?
            self.frame.projection.north
          : self.frame.projection.south
          ;
        var index = 0;
        var rising = true;
        for (var j=projection.length; index<j; index++, rising=!rising)
            if (projection[index] > newPeak)
                break;
        var low = projection[index-1];
        var high = projection[index];
        if (rising)
            projection.splice (index, 0, newPeak, (high + newPeak) / 2);
        else
            projection.splice (index, 0, (low + newPeak) / 2, newPeak);

        chooseDrag();

        self.editor.draw();
    });

    // input fields
    this.titleInput = new StringInput ('Title', this.document, {
        width: 180
    }, function (text) {
        if (!self.projection)
            return;
        var titleAction = self.editor.undo.getAction (
            self,
            ACTION_PROJECTION_RENAME,
            self.projection,
            function(){
                self.editor.renameProjection (self.projection, titleAction.projectionTitle);
                self.titleInput.set (titleAction.projectionTitle);
            }
        );
        if (titleAction.projectionTitle === undefined)
            titleAction.projectionTitle = self.projection.title;

        // set the new title
        self.editor.renameProjection (self.projection, text);
    });
    this.propsBar.appendChild (this.titleInput.elem);

    this.longitudeInput = new NumberInput ('Longitude', this.document, {
        width:      90,
        disabled:   true
    }, function (longitude) {
        if (!self.selectedControlPoint)
            return;
        var moveAction = self.editor.undo.getAction (
            self,
            ACTION_PROJECTION_POINT_MOVE,
            self.frame.projection,
            function(){
                self.frame.projection.north.splice (0, self.frame.projection.north.length);
                self.frame.projection.north.push.apply (
                    self.frame.projection.north,
                    moveAction.rollback.north
                );
                self.frame.projection.south.splice (0, self.frame.projection.south.length);
                self.frame.projection.south.push.apply (
                    self.frame.projection.south,
                    moveAction.rollback.south
                );
                self.selectedControlPoint = undefined;
                self.selectedControlPointIsNorthern = undefined;
                self.longitudeInput.enable (false);
                self.setupUIRegions();
                self.editor.showProjection (self.frame.projection);
            }
        );
        if (!moveAction.rollback)
            moveAction.rollback = {
                north:  Array.apply ([], self.frame.projection.north),
                south:  Array.apply ([], self.frame.projection.south)
            };
        var set = self.selectedControlPointIsNorthern ?
            self.frame.projection.north
          : self.frame.projection.south
          ;
        var index = set.indexOf (self.selectedControlPoint);
        // can we do that?

        // do that
        set[index] = longitude;
        self.selectedControlPoint = longitude;
        self.editor.redraw();
        self.setupUIRegions();
    });
    this.propsBar.appendChild (this.longitudeInput.elem);

    function chooseDrag(){
        self.cursorMode = 'drag';
        self.setCursor ('precision', 'longitude');
        controlCreateSectionButton (false, false);
        controlDeleteSectionButton (false, false);
        self.setupUIRegions();
        self.draw();
    }
    function chooseCreate(){
        self.cursorMode = 'create';
        self.setCursor ('precision', 'longitude');
        self.controller.clearUIRegions (self.eventSourceName);
        self.draw();
    }
    function chooseDelete(){
        self.cursorMode = 'delete';
        self.setCursor ('precision', undefined);
        self.controller.clearUIRegions (self.eventSourceName);
        self.draw();
    }

    var createSectionButtonDiv = this.document.createElement ('div');
    createSectionButtonDiv.appendChild (this.document.createTextNode ('New Section'));
    var controlCreateSectionButton = Buttonize (createSectionButtonDiv, function (isSelected) {
        if (isSelected) {
            chooseDrag();
            return false;
        }
        if (self.cursorMode !== 'drag')
            controlDeleteSectionButton (false, false);
        chooseCreate();
        return true;
    });
    this.propsBar.appendChild (createSectionButtonDiv);

    var deleteSectionButtonDiv = this.document.createElement ('div');
    deleteSectionButtonDiv.appendChild (this.document.createTextNode ('Delete Section'));
    var controlDeleteSectionButton = Buttonize (deleteSectionButtonDiv, function (isSelected) {
        if (isSelected) {
            chooseDrag();
            return false;
        }
        if (self.cursorMode !== 'drag')
            controlCreateSectionButton (false, false);
        chooseDelete();
        return true;
    });
    this.propsBar.appendChild (deleteSectionButtonDiv);

    // the "accept" and "cancel" actions return us to "drag" mode
    function returnToDrag (sourceName) {
        if (self.cursorMode === 'create')
            controlCreateSectionButton (false, false);
        else if (self.cursorMode === 'delete')
            controlDeleteSectionButton (false, false);
        else
            return;
        chooseDrag();
    }
    this.subscribe ('cancel', returnToDrag);
    this.subscribe ('accept', returnToDrag);
}
util.inherits (ProjectionEditor, Tool);
ProjectionEditor.prototype.info = {
    title:      "Edit Map Projection",
    id:         "projection",
    cursor:     "precision",
    crosshair:  "longitude"
};

ProjectionEditor.prototype.start = function (planet) {
    Tool.prototype.start.call (this, planet);
};

ProjectionEditor.prototype.stop = function(){
    Tool.prototype.stop.call (this);
    this.controller.clearUIRegions (this.eventSourceName);
};

ProjectionEditor.prototype.setupUIRegions = function(){
    this.controller.clearUIRegions (this.eventSourceName);
    var self = this;
    this.frame.projection.north.forEach (function (val, i) {
        if (val === 180 || val === -180)
            return;
        var regionInfo = {
            nw:         { x:val, y:Infinity },
            se:         { x:val, y:0 },
            margin:     { x:10, y:0 },
            cursor:     "col-resize",
            onhover:    function (isHovering) {
                // when no control point is selected
                // display the longitude of the control point under the mouse
                if (self.selectedControlPoint)
                    return;
                self.longitudeInput.set (val);
            },
            onclick:    function (isDown) {
                if (!isDown)
                    return;
                self.selectPoint (val, true);
            },
            ondrag:     function (dx, dy, dlong) {
                if (!dx)
                    return;
                // set up undo action
                var moveAction = self.editor.undo.getAction (
                    self,
                    ACTION_PROJECTION_POINT_MOVE,
                    self.frame.projection,
                    function(){
                        self.frame.projection.north.splice (0, self.frame.projection.north.length);
                        self.frame.projection.north.push.apply (
                            self.frame.projection.north,
                            moveAction.rollback.north
                        );
                        self.frame.projection.south.splice (0, self.frame.projection.south.length);
                        self.frame.projection.south.push.apply (
                            self.frame.projection.south,
                            moveAction.rollback.south
                        );
                        self.selectedControlPoint = undefined;
                        self.selectedControlPointIsNorthern = undefined;
                        self.longitudeInput.enable (false);
                        self.setupUIRegions();
                        self.editor.showProjection (self.frame.projection);
                    }
                );
                if (!moveAction.rollback)
                    moveAction.rollback = {
                        north:  Array.apply ([], self.frame.projection.north),
                        south:  Array.apply ([], self.frame.projection.south)
                    };

                if (val + dx < self.frame.projection.north[i-1] + MIN_SINUS_GAP)
                    val = Math.floor (
                        (self.frame.projection.north[i-1] + MIN_SINUS_GAP) / self.frame.degreesPerPixel
                    ) * self.frame.degreesPerPixel;
                else if (val + dx > self.frame.projection.north[i+1] - MIN_SINUS_GAP)
                    val = Math.floor (
                        (self.frame.projection.north[i+1] - MIN_SINUS_GAP) / self.frame.degreesPerPixel
                    ) * self.frame.degreesPerPixel;
                else
                    val += dx;

                self.frame.projection.north[i] = val;
                self.selectedControlPoint = val;
                self.longitudeInput.set (val);
                regionInfo.nw.x = val;
                regionInfo.se.x = val;
                self.editor.draw();
            }
        };
        self.controller.addUIRegion (self.eventSourceName, regionInfo);
    });
    this.frame.projection.south.forEach (function (val, i) {
        if (val === 180 || val === -180)
            return;
        var regionInfo = {
            nw:         { x:val, y:0 },
            se:         { x:val, y:-Infinity },
            margin:     { x:10, y:0 },
            cursor:     "col-resize",
            onhover:    function (isHovering) {
                // when no control point is selected
                // display the longitude of the control point under the mouse
                if (self.selectedControlPoint)
                    return;
                self.longitudeInput.set (val);
            },
            onclick:    function (isDown) {
                if (!isDown)
                    return;
                self.selectPoint (val, false);
            },
            ondrag:     function (dx, dy, dlong) {
                if (!dx)
                    return;
                // set up undo action
                var moveAction = self.editor.undo.getAction (
                    self,
                    ACTION_PROJECTION_POINT_MOVE,
                    self.frame.projection,
                    function(){
                        self.frame.projection.north.splice (0, self.frame.projection.north.length);
                        self.frame.projection.north.push.apply (
                            self.frame.projection.north,
                            moveAction.rollback.north
                        );
                        self.frame.projection.south.splice (0, self.frame.projection.south.length);
                        self.frame.projection.south.push.apply (
                            self.frame.projection.south,
                            moveAction.rollback.south
                        );
                        self.selectedControlPoint = undefined;
                        self.selectedControlPointIsNorthern = undefined;
                        self.longitudeInput.enable (false);
                        self.setupUIRegions();
                        self.editor.showProjection (self.frame.projection);
                    }
                );
                if (!moveAction.rollback)
                    moveAction.rollback = {
                        north:  Array.apply ([], self.frame.projection.north),
                        south:  Array.apply ([], self.frame.projection.south)
                    };

                if (val + dx < self.frame.projection.south[i-1] + MIN_SINUS_GAP)
                    val = Math.floor (
                        (self.frame.projection.south[i-1] + MIN_SINUS_GAP) / self.frame.degreesPerPixel
                    ) * self.frame.degreesPerPixel;
                else if (val + dx > self.frame.projection.south[i+1] - MIN_SINUS_GAP)
                    val = Math.floor (
                        (self.frame.projection.south[i+1] - MIN_SINUS_GAP) / self.frame.degreesPerPixel
                    ) * self.frame.degreesPerPixel;
                else
                    val += dx;

                self.frame.projection.south[i] = val;
                self.selectedControlPoint = val;
                self.longitudeInput.set (val);
                regionInfo.nw.x = val;
                regionInfo.se.x = val;
                self.editor.draw();
            }
        };
        self.controller.addUIRegion (self.eventSourceName, regionInfo);
    });
};

ProjectionEditor.prototype.selectPoint = function (longitude, isNorthern) {
    this.selectedControlPoint = longitude;
    this.selectedControlPointIsNorthern = isNorthern;
    this.draw();
    if (longitude === undefined) {
        this.longitudeInput.enable (false);
        return;
    }
    this.longitudeInput.enable (true);
};

ProjectionEditor.prototype.draw = function(){
    if (this.frame.projection !== this.lastProjection) {
        this.selectedControlPoint = undefined;
        this.selectedControlPointIsNorthern = undefined;
        this.longitudeInput.set (this.longitudeInput.value, this.frame.degreesPerPixel);
        this.titleInput.set (this.frame.projection.title);
        this.setupUIRegions();
        this.lastProjection = this.frame.projection;
    }

    this.context.clearRect (0, 0, this.canvas.width, this.canvas.height);
    this.context.fillStyle = this.editor.styles.editor.tools.normal;
    this.context.strokeStyle = this.editor.styles.editor.tools.normal;

    var resX = this.canvas.width;
    var resY = this.canvas.height;
    var offsetX = Math.round (this.frame.center.x / this.frame.degreesPerPixel);
    var offsetY = Math.round (this.frame.center.y / this.frame.degreesPerPixel);
    var centerX = Math.floor ((resX / 2) - offsetX);
    var centerY = Math.floor ((resY / 2) + offsetY);

    // clip the graphing window to the frame
    var minX = -180;
    var maxX = 180;
    var halfWidth = (this.planet.info.resolution - 1) * this.frame.altitude * this.frame.zoom;
    var frameWidth = halfWidth * 2;
    var frameHeight = this.planet.info.resolution * this.frame.altitude * this.frame.zoom;
    var halfHeight = Math.floor ((this.planet.info.resolution - 1) / 2) * this.frame.altitude * this.frame.zoom;
    if (centerX - halfWidth < 0)
        minX += (halfWidth - centerX) * this.frame.degreesPerPixel;
    if (centerX + halfWidth > resX - 1)
        maxX -= (centerX + halfWidth - resX - 1) * this.frame.degreesPerPixel;

    var verticalDirection = 1;
    for (var s=0; s<2; s++) {
        var sinusoids = this.frame.projection[SINUSES[s]];
        var rising = true;
        var position = centerX - (frameWidth / 2);
        var degPosition = -180;
        for (var i=1,j=sinusoids.length; i<j; i++, rising = !rising) {
            var able = sinusoids[i-1];
            var baker = sinusoids[i];
            // is this sinusoid within the visible frame?
            if (baker < minX) {
                // add to position and degPosition
                var dif = baker - able;
                // degPosition += dif;
                degPosition = baker;
                position += Shmath.floor (dif / this.frame.degreesPerPixel);
                continue;
            }
            if (able > maxX)
                break;

            // graph longitude `able` to `baker` in `verticalDirection`
            var lastHeight = rising ? 0 : halfHeight * verticalDirection + verticalDirection;
            var minormax, ceilorfloor, centerOffset;
            if (verticalDirection > 0) {
                minormax = Math.max;
                ceilorfloor = Shmath.floor;
                centerOffset = 0;
            } else {
                minormax = Math.min;
                ceilorfloor = Shmath.ceil;
                centerOffset = 1;
            }
            while (degPosition <= baker) {
                var height;
                if (rising) {
                    height = ceilorfloor (halfHeight * verticalDirection * Math.acos (
                        (baker - degPosition) / (baker - able)
                    ) * (2 / Math.PI)) + verticalDirection;
                    var drawY = centerY + verticalDirection - height + centerOffset;
                    var drawHeight = minormax (verticalDirection, height - lastHeight);
                    if (drawHeight < 0) {
                        drawY += drawHeight;
                        drawHeight *= -1;
                    }
                    this.context.fillRect (
                        position,
                        drawY,
                        1,
                        drawHeight
                    );
                } else {
                    height = ceilorfloor (halfHeight * verticalDirection * Math.acos (
                        (degPosition - able) / (baker - able)
                    ) * (2 / Math.PI)) + verticalDirection;
                    var drawY = centerY + verticalDirection - lastHeight + centerOffset;
                    var drawHeight = minormax (verticalDirection, lastHeight - height);
                    if (drawHeight < 0) {
                        drawY += drawHeight;
                        drawHeight *= -1;
                    }
                    this.context.fillRect (
                        position - 1,
                        drawY,
                        1,
                        drawHeight
                    );
                    if (degPosition === baker)
                        // draw the final point, right on the center line
                        this.context.fillRect (position, centerY, 1, 1);
                }
                lastHeight = height;
                position++;
                degPosition = Shmath.clean (degPosition + this.frame.degreesPerPixel, baker);
            }

            // draw a vertical line for each control point
            if (degPosition < 180) {
                this.context.beginPath();
                this.context.moveTo (position - 0.5, verticalDirection > 0 ? 0 : resY);
                this.context.lineTo (position - 0.5, centerY);
                if (
                    Shmath.equal (
                        degPosition - this.frame.degreesPerPixel,
                        this.selectedControlPoint
                    )
                 && (
                        (verticalDirection > 0 && this.selectedControlPointIsNorthern)
                     || (verticalDirection < 0 && !this.selectedControlPointIsNorthern)
                    )
                ) {
                    this.context.strokeStyle = this.editor.styles.editor.tools.highlight;
                    this.context.stroke();
                    this.context.strokeStyle = this.editor.styles.editor.tools.normal;
                } else
                    this.context.stroke();
            }
        }

        // reverse vertical direction
        verticalDirection -= 2;
    }
};

module.exports = ProjectionEditor;
