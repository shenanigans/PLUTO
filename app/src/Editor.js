
var Viewer = require ('./Viewer');
var UndoStack = require ('./UndoStack');
var tools = require ('./tools');
var Buttonize = require ('Buttonize');
var NumberInput = require ('NumberInput');
var Shmath = require ('Shmath');
var scum = require ('scum');

var RULER_WIDTH = 25;

var RESIZE_POLL_INITIAL_RATE = 75;
var RESIZE_POLL_INITIAL_COUNT = 20;
var RESIZE_POLL_RATE = 2500;

var CURSOR_TYPES = {
    precision:      "url(img/cursor_precision.png) 7 7, auto"
};

function Editor (win, prefs, controller, planet) {
    this.window = win;
    this.document = win.window.document;
    this.prefs = prefs;
    this.controller = controller;
    this.undo = new UndoStack();

    var self = this;
    // bind the undo command to our UndoStack instance
    controller.on ('undo', function (sourceName) {
        if (sourceName !== 'main')
            return;
        self.undo.undo();
    });

    this.graphicsLocked = true;
    this.crosshairMode = undefined;
    this.ui = [];
    this.activeUIRegion = undefined;
    this.draggingUIRegion = false;
    this.cursorMode = 'default';
    this.viewResolution = { x:1000, y:800 };

    // planet setup
    this.planet = planet;
    this.projections = this.planet.info.projections;

    this.frame = {
        altitude:           1,
        zoom:               1,
        center:             {
            x:                  0,
            y:                  0
        },
        degreesPerPixel:    180 / this.planet.info.resolution,
        gapLimit:           Infinity,
        projection:         this.projections[this.planet.info.defaultProjection],
        getLatitude:        function (y) {
            return Math.max (-90, Math.min (90, (
                (Math.floor (self.viewerCanvas.clientHeight / 2) - y)
              * this.degreesPerPixel
            ) + this.center.y));
        },
        getY:               function (latitude) {
            return Math.floor (self.viewerCanvas.clientHeight / 2) + (
                (this.center.y - latitude) / this.degreesPerPixel
            );
        },
        getEquatorialLongitude: function (x) {
            return Math.max (-180, Math.min (180, (
                (x - Math.floor (self.viewerCanvas.clientWidth / 2))
              * this.degreesPerPixel
            ) + this.center.x));
        },
        getLongitude:       function (x, equatorialLongitude, latitude) {
            // any chance equatorial longitude is all that's needed?
            var degreesPerHalfPixel = this.degreesPerPixel / 2;
            if (
                latitude < degreesPerHalfPixel
             && latitude > -degreesPerHalfPixel
            )
                return equatorialLongitude;
            else {
                // select the section of the current projection by equatorial longitude
                var sinusoids = latitude > 0 ? this.projection.north : this.projection.south;
                var able = -180;
                var baker;
                var isRising = true;
                for (var i=1,j=sinusoids.length; i<j; i++) {
                    baker = sinusoids[i];
                    if (equatorialLongitude < baker) // found the correct sinusoid!
                        break;
                    able = baker;
                    isRising = !isRising;
                }
                // calculate real longitude
                // get local degrees-per-pixel and pixel width
                var localDegreesPerPixel = this.degreesPerPixel / Math.cos (
                    Math.PI * (latitude / 180)
                );
                // get offset from sinusoid center point and compare to pixel width
                var center, limit, limitFn;
                if (isRising) {
                    center = baker;
                    limit = able;
                    limitFn = Math.max;
                } else {
                    center = able;
                    limit = baker;
                    limitFn = Math.min;
                }
                var centerX = Math.floor (
                    (self.viewerCanvas.clientWidth / 2) + ((center - this.center.x) / this.degreesPerPixel)
                );
                var offset = x - centerX;
                return Math.max (-180, Math.min (180, limitFn (limit,
                    center + (offset * localDegreesPerPixel)
                )));
            }
        },
        getX:               function (longitude, equatorialLongitude, latitude) {
            // equatorialLongitude is just used to select the projection segment
            var sinusoids = latitude > 0 ? this.projection.north : this.projection.south;
            var center;
            var isRising = true;
            for (var i=1,j=sinusoids.length; i<j; i++) {
                var val = sinusoids[i];
                if (isRising) center = val;
                if (equatorialLongitude <= val)
                    break;
                isRising = !isRising;
            }
            var localDegreesPerPixel = this.degreesPerPixel / Math.cos (Math.PI * (latitude / 180));
            var centerX = Math.floor (
                (self.viewerCanvas.clientWidth / 2) + ((center - this.center.x) / this.degreesPerPixel)
            );
            var offset = (longitude - center) / localDegreesPerPixel;
            if (isRising)
                offset = Math.ceil (offset);
            else
                offset = Math.floor (offset);
            return centerX + offset;
        }
    };

    // bind basic window events
    win.on ('resize', function(){
        self.handleResize();
    });
    win.on ('loaded', function(){
        try {
            self.init();
        }catch(err){
            console.log (err);
        }
    });

    // poll for initial resize
    var initialPollsRemaining = RESIZE_POLL_INITIAL_COUNT;
    var resizePollTimer = setInterval (function pollForResize(){
        if (
            self.ruler_lng.width != self.ruler_lng.clientWidth
         || self.ruler_lat.height != self.ruler_lat.clientHeight
        )
            self.handleResize();
        if (initialPollsRemaining && !--initialPollsRemaining) {
            clearInterval (resizePollTimer);
            resizePollTimer = setInterval (pollForResize, RESIZE_POLL_RATE);
        }
    }, RESIZE_POLL_INITIAL_RATE);
}

Editor.prototype.init = function(){
    scum (this.window.window);
    var self = this;
    this.elem = this.document.getElementById ('Editor');

    // pick up canvases
    this.viewerCanvas = this.document.getElementById ("FlatViewerCanvas");
    this.ruler_lng = this.document.getElementById ("LngRulerCanvas");
    this.ruler_lat = this.document.getElementById ("LatRulerCanvas");
    this.toolCanvas = this.document.getElementById ("FlatEditorToolCanvas");
    this.cursorCanvas = this.document.getElementById ("FlatEditorCursorCanvas");
    this.fragQuickSelectCanvas = this.document.getElementById ("FragQuickSelectCanvas");

    // pick up contexts
    this.cursorContext = this.cursorCanvas.getContext ('2d');
    this.ruler_lng_context = this.ruler_lng.getContext ('2d');
    this.ruler_lat_context = this.ruler_lat.getContext ('2d');
    this.toolContext = this.toolCanvas.getContext ('2d');
    this.fqs = this.fragQuickSelectCanvas.getContext ('2d');

    // set up the Projection selection menu
    this.projectionSelect = this.document.getElementById ('ProjectionSelector');
    this.projectionSelect.on ('change', function(){
        if (this.selectedIndex < this.children.length - 1)
            self.showProjection (self.planet.info.projections[this.selectedIndex]);
        else
            self.createProjection();
        self.draw();
    });
    for (var i=0,j=this.planet.info.projections.length; i<j; i++) {
        var projection = this.planet.info.projections[i];
        var optionElem = this.document.createElement ('option');
        optionElem.appendChild (this.document.createTextNode (projection.title));
        if (this.planet.info.defaultProjection === i)
            optionElem.setAttribute ('selected', 'true');
        this.projectionSelect.insertBefore (optionElem, this.projectionSelect.lastElementChild);
    }

    // set up Viewer controller inputs
    this.altitudeInput = new NumberInput ('Altitude', this.document, {
        width:      46,
        value:      1,
        step:       2,
        min:        -1,
        precision:  0
    }, function (altitude) {
        self.frame.altitude = altitude;
        self.frame.degreesPerPixel = 180 / (
            self.planet.info.resolution * altitude * self.frame.zoom
        );
        self.draw();
        self.updateFragmentSelection();
    });
    this.zoomInput = new NumberInput ('Pixel Zoom', this.document, {
        width:      46,
        value:      1,
        precision:  0
    }, function (zoom) {

    });
    this.controls = this.document.getElementById ('EditorControls');
    this.controls.appendChild (this.altitudeInput.elem);
    this.controls.appendChild (this.zoomInput.elem);

    // attach to the CommandController
    this.controller.addWindow ('main', this.window, this.frame);
    this.cursor = this.controller.addMouseEventSource (
        'main',
        this.cursorCanvas,
        [ 0, 0, RULER_WIDTH, RULER_WIDTH ]
    );

    // cursor changes triggered by UI interractions
    this.controller.on ('ui_hover', function (sourceName, region, isActive) {
        if (isActive)
            self.cursorCanvas.style.cursor = region.cursor || self.cursorMode;
        else
            self.cursorCanvas.style.cursor = self.cursorMode;
    });

    this.controller.on ('ui_click', function (sourceName, region, isActive) {

    });

    // normal cursor updates
    this.controller.on ('cursor', function (sourceName) {
        if (sourceName !== 'main')
            return;
        self.refreshCursor();
        self.drawLongitudeRuler();
    });

    // move the frame around
    this.controller.on ('frame', function (sourceName, dx, dy) {
        var dx_p = dx * self.viewerCanvas.width;
        var dy_p = dy * self.viewerCanvas.height;
        var frameHeight = (self.planet.info.resolution + 1) * self.frame.altitude;
        self.frame.center.x = Math.max (-180, Math.min (180,
            self.frame.center.x + (dx_p * self.frame.degreesPerPixel)
        ));
        self.frame.center.y = Math.max (-90, Math.min (90,
            self.frame.center.y - (dy_p * self.frame.degreesPerPixel)
        ));
        self.draw();
        self.updateFragmentSelection();
    });

    // altitude and zoom
    this.controller.on ('altitude_up', function (sourceName) {
        self.frame.altitude += 2;
        var centerX = Math.floor (self.viewerCanvas.clientWidth / 2);
        var centerY = Math.floor (self.viewerCanvas.clientHeight / 2);
        self.frame.degreesPerPixel = 180 / (
            self.planet.info.resolution
          * self.frame.altitude
          * self.frame.zoom
        );
        self.frame.center.x =
            self.cursor.equatorialLongitude
              + (centerX - self.cursor.pixel.x) * self.frame.degreesPerPixel
              ;
        self.frame.center.y =
            self.cursor.latitude
              + (self.cursor.pixel.y - centerY) * self.frame.degreesPerPixel
              ;

        self.altitudeInput.set (self.frame.altitude);

        self.draw();
        self.updateFragmentSelection();
    });
    this.controller.on ('altitude_down', function (sourceName) {
        if (self.frame.altitude === 1)
            return;
        self.frame.altitude -= 2;
        var centerX = Math.floor (self.viewerCanvas.clientWidth / 2);
        var centerY = Math.floor (self.viewerCanvas.clientHeight / 2);
        self.frame.degreesPerPixel = 180 / (
            self.planet.info.resolution
          * self.frame.altitude
          * self.frame.zoom
        );
        self.frame.center.x =
            self.cursor.equatorialLongitude
              + (centerX - self.cursor.pixel.x) * self.frame.degreesPerPixel
              ;
        self.frame.center.y =
            self.cursor.latitude
              + (self.cursor.pixel.y - centerY) * self.frame.degreesPerPixel
              ;

        self.altitudeInput.set (self.frame.altitude);

        self.draw();
        self.updateFragmentSelection();
    });
    this.controller.on ('zoom_up', function (sourceName) {
        // TODO pixel zooming
    });
    this.controller.on ('zoom_down', function (sourceName) {
        // TODO pixel zooming
    });

    this.controller.on ('paint', function (sourceName, pressure, lng, lat, dLng, dLat) {
        // console.log ('paint', pressure, lng, lat, dLng, dLat);
    });

    // tool selection commands
    this.controller.on ('tool', function (toolname) {
        if (self.activeTool)
            self.activeTool.stop();
        self.activeTool = tools[toolname];
        self.activeTool.start (self.planet);
        self.activeTool.draw();
    });

    this.tools = tools (
        this.toolCanvas,
        this.toolContext,
        this,
        'main',
        function (cursorName, crosshairMode) {
            self.cursorMode = CURSOR_TYPES[cursorName] || cursorName;
            if (!self.activeUIRegion)
                self.cursorCanvas.style.cursor = self.cursorMode;
            if (self.crosshairMode !== crosshairMode) {
                self.crosshairMode = crosshairMode;
                self.refreshCursor();
            }
        }
    );

    // bind tool buttons
    this.toolButtonControllers = {};
    for (var toolname in this.tools) (function(){
        var tool = self.tools[toolname];
        var elem = self.document.getElementById ('tool_' + tool.info.id);
        self.toolButtonControllers[tool.info.id] = Buttonize (elem, function(){
            self.changeTools (tool);
            return true;
        });
    })();

    // grab the tool "props bar" target element
    this.propsbarContainer = this.document.getElementById ('PropsContainer');

    // set up the drawer!
    var currentDrawer, currentDrawerElem;
    function drawerButtonReactor (elem) {
        return function (isSelected) {
            if (isSelected) {
                self.closeDrawer();
                elem.dropClass ('active');
                currentDrawer = undefined;
            } else {
                self.openDrawer();
                elem.addClass ('active');
                if (currentDrawer) {
                    currentDrawer (false, false);
                    currentDrawerElem.dropClass ('active');
                }
                currentDrawer = this;
                currentDrawerElem = elem;
            }
            return !isSelected;
        };
    }

    // section: View
    var viewDrawerElem = this.document.getElementById ('ViewDrawer');
    var viewDrawerButtonElem = viewDrawerElem.firstElementChild;
    var viewDrawerButton = Buttonize (
        viewDrawerButtonElem,
        drawerButtonReactor (viewDrawerElem)
    );

    // section: Planet options
    var planetDrawerElem = this.document.getElementById ('PlanetDrawer');
    var planetDrawerButtonElem = planetDrawerElem.firstElementChild;
    var planetDrawerButton = Buttonize (
        planetDrawerButtonElem,
        drawerButtonReactor (planetDrawerElem)
    );
    var planetRadiusDiv = this.document.createElement ('div');
    this.planetRadiusInput = new NumberInput ('Radius', this.document, {
        width:  90,
        units:  'km',
        value:  this.planet.info.radius
    }, function (radius) {
        console.log ('changed radius', radius);
    });

    // section: Places
    var placesDrawerElem = this.document.getElementById ('PlacesDrawer');
    var placesDrawerButtonElem = placesDrawerElem.firstElementChild;
    var placesDrawerButton = Buttonize (
        placesDrawerButtonElem,
        drawerButtonReactor (placesDrawerElem)
    );

    // section: Layers
    var layersDrawerElem = this.document.getElementById ('LayersDrawer');
    var layersDrawerButtonElem = layersDrawerElem.firstElementChild;
    var layersDrawerButton = Buttonize (
        layersDrawerButtonElem,
        drawerButtonReactor (layersDrawerElem)
    );

    // section: Frags
    var fragDrawerElem = this.document.getElementById ('FragDrawer');
    var fragDrawerButtonElem = fragDrawerElem.firstElementChild;
    var fragDrawerButton = Buttonize (
        fragDrawerButtonElem,
        drawerButtonReactor (fragDrawerElem)
    );
    this.fragListElem = this.document.getElementById ('FragList');
    this.fragButtonContainer = this.document.getElementById ('FragButtonContainer');
    var newFragElem = this.document.createElement ('div');
    newFragElem.appendChild (this.document.createTextNode ('New'));
    this.fragButtonContainer.appendChild (newFragElem);
    this.newFragButton = Buttonize (newFragElem, function (isSelected) {
        console.log ('new frag');
    });
    var deleteFragElem = this.document.createElement ('div');
    deleteFragElem.appendChild (this.document.createTextNode ('Delete'));
    this.fragButtonContainer.appendChild (deleteFragElem);
    this.deleteFragButton = Buttonize (deleteFragElem, function (isSelected) {
        console.log ('delete frag');
    });
    this.fragAltitudeInput = new NumberInput ('Altitude', this.document, {
        width:      46,
        disabled:   true
    }, function (altitude) {
        console.log ('changed frag altitude', altitude);
    });
    this.fragButtonContainer.appendChild (this.fragAltitudeInput.elem);

    // create a Viewer
    this.viewer = new Viewer (this.planet, this.viewerCanvas, this.frame);

    // apply the current style profile
    this.setStyles (this.prefs.styles.schemes[this.prefs.styles.defaultScheme]);

    // show the window
    this.window.show();
    this.window.maximize();
    this.winInfo = {
        x:      this.window.x,
        y:      this.window.y,
        width:  this.window.width,
        height: this.window.height
    };

    // begin drawing
    this.graphicsLocked = false;
    this.handleResize();
};

Editor.prototype.openDrawer = function(){
    this.elem.addClass ('drawerOpen');
    this.handleResize();
};

Editor.prototype.closeDrawer = function(){
    this.elem.dropClass ('drawerOpen');
    this.handleResize();
};

Editor.prototype.draw = function(){
    this.refreshCursor();
    this.drawLongitudeRuler();
    this.drawLatitudeRuler();
    this.viewer.draw();
    if (this.activeTool)
        this.activeTool.draw();
};

/*
    Search the Planet for a specific Projection and make it the active Projection.
*/
Editor.prototype.showProjection = function (projection) {
    var index = this.planet.info.projections.indexOf (projection);
    if (index < 0)
        throw new Error ('cannot find this Projection on the current Planet');
    this.frame.projection = projection;
    this.projectionSelect.selectedIndex = index;
    this.drawLongitudeRuler();
    this.refreshCursor();
    if (this.activeTool)
        this.activeTool.draw (projection);
    this.controller.checkUIRegions ('main');
};

/*
    Add a new Projection to the Planet and set it active.
*/
Editor.prototype.createProjection = function(){
    var newProjection = {
        title:  "Untitled Projection",
        north:  [ -180, 0, 180 ],
        south:  [ -180, 0, 180 ]
    };
    this.planet.info.projections.push (newProjection);

    var optionElem = this.document.createElement ('option');
    optionElem.appendChild (this.document.createTextNode ('Untitled Projection'));
    this.projectionSelect.insertBefore (optionElem, this.projectionSelect.lastElementChild);

    this.changeTools (this.tools.ProjectionEditor);
    this.showProjection (newProjection);
};

/*

*/
Editor.prototype.renameProjection = function (projection, title) {
    var index = this.planet.info.projections.indexOf (projection)
    if (index < 0)
        return;
    projection.title = title;
    this.projectionSelect.children[index].textContent = title;
};

/*
    Remove a Projection from the Planet and set the last Projection viewed as active. When deleting
    the default Projection, the last viewed Projection becomes default, or the first Projection if
    this was the only Projection viewed this session. Will not delete the last Projection from the
    Planet (silent failure).
*/
Editor.prototype.deleteProjection = function (projection) {

};

Editor.prototype.setStyles = function (scheme) {
    this.styles = scheme;
};

Editor.prototype.handleResize = function(){
    if (this.graphicsLocked)
        return;

    // update canvas sizes
    this.viewerCanvas.setAttribute ('width', this.viewerCanvas.clientWidth);
    this.viewerCanvas.setAttribute ('height', this.viewerCanvas.clientHeight);
    this.ruler_lng.setAttribute ('width', this.ruler_lng.clientWidth);
    this.ruler_lng.setAttribute ('height', this.ruler_lng.clientHeight);
    this.ruler_lat.setAttribute ('width', this.ruler_lat.clientWidth);
    this.ruler_lat.setAttribute ('height', this.ruler_lat.clientHeight);
    this.toolCanvas.setAttribute ('width', this.toolCanvas.clientWidth);
    this.toolCanvas.setAttribute ('height', this.toolCanvas.clientHeight);
    this.cursorCanvas.setAttribute ('width', this.cursorCanvas.clientWidth);
    this.cursorCanvas.setAttribute ('height', this.cursorCanvas.clientHeight);
    this.fragQuickSelectCanvas.setAttribute ('width', this.fragQuickSelectCanvas.clientWidth);
    this.fragQuickSelectCanvas.setAttribute ('height', this.fragQuickSelectCanvas.clientHeight);

    this.draw();
};

Editor.prototype.changeTools = function (tool) {
    if (this.activeTool) {
        this.activeTool.stop();
        this.toolButtonControllers[this.activeTool.info.id] (false, false);
    }
    this.activeTool = tool;
    this.toolButtonControllers[this.activeTool.info.id] (false, true);
    tool.start (this.planet);
    this.propsbarContainer.appendChild (tool.propsBar);
    tool.draw();
};

Editor.prototype.updateFragmentSelection = function(){
    // get the visible frame limits
    var halfWidth = this.viewerCanvas.clientWidth / 2;
    var halfHeight = this.viewerCanvas.clientHeight / 2;
    var frame = [
        this.frame.center.y + this.frame.degreesPerPixel * Math.floor (halfHeight),
        this.frame.center.x + this.frame.degreesPerPixel * Math.ceil (halfWidth),
        this.frame.center.y - this.frame.degreesPerPixel * Math.ceil (halfHeight),
        this.frame.center.x - this.frame.degreesPerPixel * Math.floor (halfWidth)
    ];

    // toss current visible fragment list and get a new one from the planet
    this.planet.getFragments (frame);
};

var MIN_PIX_PER_LNG_MARK = 16;
Editor.prototype.drawLongitudeRuler = function(){
    if (this.graphicsLocked)
        return;

    this.ruler_lng_context.clearRect (0, 0, this.ruler_lng.width, this.ruler_lng.height);

    var res = this.ruler_lng.width;
    var frameWidth = 2 * this.planet.info.resolution * this.frame.altitude * this.frame.zoom;

    var localDegreesPerPixel = Math.min (
        360,
        360 / (frameWidth * Math.cos ((this.cursor.latitude * Math.PI) / 180))
    );

    // get the frame boundaries, in degrees
    var windowDegrees = res * this.frame.degreesPerPixel;
    var startDeg = Math.max (-180, this.frame.center.x - (windowDegrees / 2));
    var endDeg = Math.min (180, this.frame.center.x + (windowDegrees / 2));
    // get the frame boundaries, in pixels
    var offset = (this.frame.center.x / this.frame.degreesPerPixel);
    var start = (res / 2) - offset - (frameWidth / 2);
    var end = (res / 2) - offset + (frameWidth / 2);
    // color the cardinals
    if (offset > -1 * (res / 2)) {
        this.ruler_lng_context.fillStyle = this.styles.editor.cardinals.west;
        this.ruler_lng_context.fillRect (0, 0, Math.floor ((res / 2) - offset), this.ruler_lng.height);
    }
    if (offset < res / 2) {
        this.ruler_lng_context.fillStyle = this.styles.editor.cardinals.east;
        this.ruler_lng_context.fillRect (
            Math.floor ((res / 2) - offset),
            0,
            Math.floor ((res / 2) + offset),
            this.ruler_lng.height
        );
    }
    // block out area outside map
    if (start > 0) {
        this.ruler_lng_context.fillStyle = this.styles.editor.rulerBG;
        this.ruler_lng_context.fillRect (0, 0, start, this.ruler_lng.height);
    }
    if (end < res) {
        this.ruler_lng_context.fillStyle = this.styles.editor.rulerBG;
        this.ruler_lng_context.fillRect (end, 0, res - end, this.ruler_lng.height);
    }

    // get the projection sinusoids
    var sinusoids = this.cursor.latitude > 0 ?
        this.frame.projection.north
      : this.frame.projection.south
      ;
    var rising = true;
    for (var i=1,j=sinusoids.length; i<j; i++, rising = !rising) {
        var able = sinusoids[i-1];
        var baker = sinusoids[i];
        var pixelWidth = (
            (baker - able)
          * Math.cos ((this.cursor.latitude * Math.PI) / 180)
          * this.planet.info.resolution
          * this.frame.altitude
          * this.frame.zoom
        ) / 180;
        pixelWidth = rising ? Math.ceil (pixelWidth) : Math.floor (pixelWidth);
        // draw this ruler section, starting at the sinusoid center value
        var direction, degPosition, terminus;
        if (rising) {
            direction = -1;
            degPosition = baker;
            terminus = able;
        } else {
            direction = 1;
            degPosition = able;
            terminus = baker;
        }
        var dif = Math.abs (terminus - degPosition);
        // draw start/end block
        this.ruler_lng_context.fillStyle = this.styles.editor.rulerBG;
        if (rising)
            this.ruler_lng_context.fillRect (
                Math.floor (
                    (res / 2)
                  + (able / this.frame.degreesPerPixel)
                  - (this.frame.center.x / this.frame.degreesPerPixel)
                ),
                0,
                Math.floor (((baker - able) / this.frame.degreesPerPixel) - pixelWidth),
                this.ruler_lng.height
            );
        else
            this.ruler_lng_context.fillRect (
                Math.ceil (
                    (res / 2)
                  + (able / this.frame.degreesPerPixel)
                  + pixelWidth + 1
                  - (this.frame.center.x / this.frame.degreesPerPixel)
                ),
                0,
                Math.floor (((baker - able) / this.frame.degreesPerPixel) - pixelWidth) + 1,
                this.ruler_lng.height
            );
        // pixels/degrees per mark
        var minDegreesPerMark = MIN_PIX_PER_LNG_MARK * localDegreesPerPixel;
        var degreesPerMark = 5 * Math.ceil (minDegreesPerMark / 5);
        var pixelsPerMark = Math.max (MIN_PIX_PER_LNG_MARK, Math.floor (degreesPerMark / localDegreesPerPixel));
        var realDegreesPerMark = pixelsPerMark * localDegreesPerPixel;
        pixelsPerMark *= direction;
        realDegreesPerMark *= direction;
        // get ready to draw
        this.ruler_lng_context.strokeStyle = this.styles.editor.rulerMarks;
        this.ruler_lng_context.fillStyle = this.styles.global.text.rulers.color;
        this.ruler_lng_context.font = this.styles.global.text.rulers.font;
        this.ruler_lng_context.textAlign = 'center';
        // set `position` to the sinusoid's centerline
        var position = Math.round (
            Math.floor (res / 2)
          + (degPosition / this.frame.degreesPerPixel)
          - (this.frame.center.x / this.frame.degreesPerPixel)
        ) + 0.5;
        // draw lines and numbers
        var first = true;
        while (direction * (terminus - degPosition) >= 0) {
            this.ruler_lng_context.beginPath();
            this.ruler_lng_context.moveTo (position, 0);
            this.ruler_lng_context.lineTo (position, this.ruler_lng.height);
            this.ruler_lng_context.stroke();
            this.ruler_lng_context.beginPath();
            var showPosition;
            if (first) {
                first = false;
                showPosition = Math.abs (Math.round (degPosition));
                this.ruler_lng_context.font = this.styles.global.text.rulers.highlight.font;
                this.ruler_lng_context.fillText (
                    showPosition,
                    position,
                    this.ruler_lng.height - 12
                );
                this.ruler_lng_context.font = this.styles.global.text.rulers.font
            } else if (rising) {
                showPosition = Math.abs (Math.ceil (degPosition));
                this.ruler_lng_context.textAlign = 'left';
                this.ruler_lng_context.fillText (
                    showPosition,
                    position,
                    this.ruler_lng.height - 2
                );
            } else {
                showPosition = Math.abs (Math.floor (degPosition));
                this.ruler_lng_context.textAlign = 'right';
                this.ruler_lng_context.fillText (
                    showPosition,
                    position,
                    this.ruler_lng.height - 2
                );
            }
            degPosition += realDegreesPerMark;
            position += pixelsPerMark;
        }
    }
};

var MIN_PIX_PER_LAT_MARK = 20;
Editor.prototype.drawLatitudeRuler = function(){
    if (this.graphicsLocked)
        return;

    this.ruler_lat_context.clearRect (0, 0, this.ruler_lat.width, this.ruler_lat.height);

    var res = this.ruler_lat.height;
    var frameHeight = (this.planet.info.resolution + 1) * this.frame.altitude;
    if (this.frame.zoom < this.frame.gapLimit)
        frameHeight *= this.frame.zoom
    else {
        frameHeight *= this.frame.zoom + 1;
        frameHeight += 1;
    }
    var cornerToZero = Math.floor ((res / 2) + (this.frame.center.y / this.frame.degreesPerPixel));

    // color-in north and south regions
    if (cornerToZero > 0) {
        // north region
        this.ruler_lat_context.fillStyle = this.styles.editor.cardinals.north;
        this.ruler_lat_context.fillRect (0, 0, this.ruler_lat.width, cornerToZero);
    }
    if (cornerToZero < res) {
        // south region
        this.ruler_lat_context.fillStyle = this.styles.editor.cardinals.south;
        this.ruler_lat_context.fillRect (0, cornerToZero, this.ruler_lat.width, res - cornerToZero);
    }

    // where to start and stop marking hashes
    var start = Math.max (0, cornerToZero - Math.floor (frameHeight / 2));
    var end = Math.min (res-1, cornerToZero + Math.ceil (frameHeight / 2));
    // how many degrees are in view?
    var degreesInView = 180;
    if (start === 0 || end === res-1)
        degreesInView = (end - start) * this.frame.degreesPerPixel;
    // what's the minimum number of degrees we can display per mark?
    var minDegreesPerMark = MIN_PIX_PER_LAT_MARK * this.frame.degreesPerPixel;
    var degreesPerMark = 5 * Math.ceil (minDegreesPerMark / 5);
    var pixelsPerMark = Math.max (MIN_PIX_PER_LAT_MARK, Math.floor (degreesPerMark / this.frame.degreesPerPixel));
    var realDegreesPerMark = pixelsPerMark * this.frame.degreesPerPixel;
    // draw start/end blocks
    this.ruler_lat_context.fillStyle = this.styles.editor.rulerBG;
    if (start !== 0)
        this.ruler_lat_context.fillRect (0, 0, this.ruler_lat.width, start);
    if (end !== res - 1)
        this.ruler_lat_context.fillRect (0, end, this.ruler_lat.width, this.ruler_lat.height - end);
    // begin drawing marks
    this.ruler_lat_context.strokeStyle = '#aaa';
    this.ruler_lat_context.fillStyle = '#000';
    this.ruler_lat_context.font = '12px palatino';
    this.ruler_lat_context.textAlign = 'right';
    var position = cornerToZero;
    if (Math.floor (position) === position)
        position += 0.5;
    this.ruler_lat_context.beginPath();
    this.ruler_lat_context.moveTo (0, position);
    this.ruler_lat_context.lineTo (this.ruler_lat.width, position);
    this.ruler_lat_context.stroke();
    this.ruler_lat_context.beginPath();
    this.ruler_lat_context.fillText (
        '0',
        this.ruler_lat.width,
        position + 4
    );
    // first below the center, inclusive
    var cursor = realDegreesPerMark;
    position += pixelsPerMark;
    while (cursor <= 90) {
        // is the cursor point withing the visible frame?
        var pixelsFromCenter = (cursor + this.frame.center.y) / this.frame.degreesPerPixel;
        if (Math.abs (pixelsFromCenter) < res / 2) {
            this.ruler_lat_context.beginPath();
            this.ruler_lat_context.moveTo (0, position);
            this.ruler_lat_context.lineTo (this.ruler_lat.width, position);
            this.ruler_lat_context.stroke();
            this.ruler_lat_context.beginPath();
            this.ruler_lat_context.fillText (
                String (Math.abs (Math.round (cursor))),
                this.ruler_lat.width,
                position - 2
            );
        }
        // update the cursor and position
        cursor += realDegreesPerMark;
        position += pixelsPerMark;
    }
    // then above the center, not inclusive
    cursor = realDegreesPerMark * -1;
    position = cornerToZero - pixelsPerMark;
    if (Math.floor (position) === position)
        position += 0.5;
    while (cursor >= -90) {
        // is the cursor point within the visible frame?
        var pixelsFromCenter = (cursor + this.frame.center.y) / this.frame.degreesPerPixel;
        if (Math.abs (pixelsFromCenter) < res / 2) {
            this.ruler_lat_context.beginPath();
            this.ruler_lat_context.moveTo (0, position);
            this.ruler_lat_context.lineTo (this.ruler_lat.width, position);
            this.ruler_lat_context.stroke();
            this.ruler_lat_context.beginPath();
            this.ruler_lat_context.fillText (
                String (Math.abs (Math.round (cursor * -1))),
                this.ruler_lat.width,
                position + 10
            );
        }
        // update the cursor and position
        cursor -= realDegreesPerMark;
        position -= pixelsPerMark;
    }
};

Editor.prototype.refreshCursor = function(){
    if (this.graphicsLocked)
        return;

    this.cursorContext.clearRect (0, 0, this.cursorCanvas.width, this.cursorCanvas.height);

    // this.cursorContext.fillStyle = this.styles.editor.cursor;
    this.cursorContext.fillStyle = this.styles.editor.cursor;
    this.cursorContext.strokeStyle = this.styles.editor.cursor;
    this.cursorContext.lineWidth = 1;
    var x = Math.round (this.cursor.x * this.viewerCanvas.width) + RULER_WIDTH + 0.5;
    var y = Math.round (this.cursor.y * this.viewerCanvas.height) + 0.5;

    // crosshairs active?
    if (!this.crosshairMode) {
        // draw "pip" marks on the rulers only
        this.cursorContext.beginPath();
        this.cursorContext.moveTo (x, this.cursorCanvas.height - RULER_WIDTH);
        this.cursorContext.lineTo (x, this.cursorCanvas.height)
        this.cursorContext.stroke();
        this.cursorContext.beginPath();
        this.cursorContext.moveTo (0, y);
        this.cursorContext.lineTo (RULER_WIDTH, y)
        this.cursorContext.stroke();
        return;
    }

    // simple crosshair mode?
    if (this.crosshairMode === 'crosshair') {
        this.cursorContext.beginPath();
        this.cursorContext.moveTo (x, 0);
        this.cursorContext.lineTo (x, this.cursorCanvas.height)
        this.cursorContext.stroke();
        this.cursorContext.beginPath();
        this.cursorContext.moveTo (0, y);
        this.cursorContext.lineTo (this.cursorCanvas.width, y)
        this.cursorContext.stroke();
        return;
    }

    // constant-longitude mode?
    if (this.crosshairMode === 'longitude') {
        // first, draw the latitude line
        this.cursorContext.beginPath();
        this.cursorContext.moveTo (0, y);
        this.cursorContext.lineTo (this.cursorCanvas.width, y);
        this.cursorContext.stroke();

        // now draw the "pip" line that indicates the cursor's position on the longitude ruler
        this.cursorContext.beginPath();
        this.cursorContext.moveTo (x, this.cursorCanvas.height - RULER_WIDTH);
        this.cursorContext.lineTo (x, this.cursorCanvas.height);
        this.cursorContext.stroke();

        // obtain the graphing window and relevant sinusoids
        var frameHeight = (this.planet.info.resolution + 1) * this.frame.altitude * this.frame.zoom;
        var centerX =
            Math.floor (this.viewerCanvas.width / 2)
          - Math.round (this.frame.center.x / this.frame.degreesPerPixel)
          + RULER_WIDTH
          ;
        var centerY =
            Math.floor (this.viewerCanvas.height / 2)
          + Math.round (this.frame.center.y / this.frame.degreesPerPixel)
          ;

        // calculate equatorial position of the cursor's real longitude (in pixels) and draw
        var eqX = centerX + Math.round (this.cursor.longitude / this.frame.degreesPerPixel);
        if (eqX >= RULER_WIDTH)
            this.cursorContext.fillRect (
                eqX,
                centerY,
                1,
                1
            );

        if (centerY > 0) {
            // graph longitude on the northern sinusoid
            // select the sinusoid
            var northAble = -180, northBaker;
            var northRising = true;
            var sample = this.cursor.latitude > 0 ?
                this.cursor.equatorialLongitude
              : this.cursor.longitude
              ;
            for (var i=1, j=this.frame.projection.north.length; i<j; i++) {
                northBaker = this.frame.projection.north[i];
                if (sample <= northBaker)
                    break;
                northAble = northBaker;
                northRising = !northRising;
            }
            // begin drawing from the equator northward
            var position = centerY - 1;
            var degPosition = this.frame.degreesPerPixel;
            var lastX;
            while (position >= 0 && degPosition <= 90) {
                var drawX = this.frame.getX (
                    this.cursor.longitude,
                    sample,
                    degPosition
                ) + RULER_WIDTH;
                if (drawX >= RULER_WIDTH)
                    this.cursorContext.fillRect (
                        drawX,
                        position,
                        1,
                        1
                    );
                var deltaX = lastX === undefined ? 1 : Math.max (1, Math.abs (drawX - lastX));
                lastX = drawX;
                if (deltaX > 1) {
                    var spot = northRising ? drawX - deltaX + 1 : drawX + deltaX - 1;
                    this.cursorContext.fillRect (
                        spot,
                        position + 1,
                        deltaX - 1,
                        1
                    )
                }
                position--;
                degPosition = Shmath.clean (degPosition + this.frame.degreesPerPixel, 90);
            }
        }
        if (centerY < this.viewerCanvas.height - 1) {
            // graph longitude on the southern sinusoid
            // select the sinusoid
            var southAble = -180, southBaker;
            var southRising = true;
            var sample = this.cursor.latitude < 0 ?
                this.cursor.equatorialLongitude
              : this.cursor.longitude
              ;
            for (var i=1, j=this.frame.projection.south.length; i<j; i++) {
                southBaker = this.frame.projection.south[i];
                if (sample <= southBaker)
                    break;
                southAble = southBaker;
                southRising = !southRising;
            }
            // begin drawing from the equator southward
            var position = centerY + 1;
            var degPosition = -this.frame.degreesPerPixel;
            var lastX = undefined;
            while (position < this.viewerCanvas.height && degPosition >= -90) {
                var drawX = this.frame.getX (
                    this.cursor.longitude,
                    sample,
                    degPosition
                ) + RULER_WIDTH;
                if (drawX >= RULER_WIDTH)
                    this.cursorContext.fillRect (
                        drawX,
                        position,
                        1,
                        1
                    );
                var deltaX = lastX === undefined ? 1 : Math.max (1, Math.abs (drawX - lastX));
                lastX = drawX;
                if (deltaX > 1) {
                    var spot = southRising ? drawX - deltaX + 1 : drawX + deltaX - 1;
                    this.cursorContext.fillRect (
                        spot,
                        position - 1,
                        deltaX - 1,
                        1
                    )
                }
                position++;
                degPosition = Shmath.clean (degPosition - this.frame.degreesPerPixel, -90);
            }
        }

        return;
    }

    console.log ('WARNING - unknown crosshair mode', this.crosshairMode);
};

module.exports = Editor;
