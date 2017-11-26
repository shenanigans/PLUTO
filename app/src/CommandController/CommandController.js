
var EventEmitter = require ('events').EventEmitter;
var util = require ('util');

// global symbolic tokens
global.KEYS      = {};
global.LMB       = global.KEYS.LMB       = Symbol ("Left Mouse Button");
global.MMB       = global.KEYS.MMB       = Symbol ("Middle Mouse Button");
global.RMB       = global.KEYS.RMB       = Symbol ("Right Mouse Button");
global.WHEELUP   = global.KEYS.WHEELUP   = Symbol ("Mouse Wheel Up");
global.WHEELDOWN = global.KEYS.WHEELDOWN = Symbol ("Mouse Wheel Down");
global.CONTROL   = global.KEYS.CONTROL   = Symbol ("Modifier Key: control");
global.ALT       = global.KEYS.ALT       = Symbol ("Modifier Key: alt");
global.SHIFT     = global.KEYS.SHIFT     = Symbol ("Modifier Key: shift");
global.SPACE     = global.KEYS.SPACE     = Symbol ("Modifier Key: space");

var MOUSE_BUTTONS = [ undefined, LMB, RMB, undefined, MMB ];

var HTML_KEYS = {
    Control:    CONTROL,
    Shift:      SHIFT,
    Alt:        ALT,
    ' ':        SPACE
};
var MOD_MASKS = {};
MOD_MASKS[CONTROL]  = 1;
MOD_MASKS[SHIFT]    = 2;
MOD_MASKS[ALT]      = 4;
MOD_MASKS[SPACE]    = 8;
var MOD_INVERSE = {};
MOD_MASKS[CONTROL]  = 14;
MOD_MASKS[SHIFT]    = 13;
MOD_MASKS[ALT]      = 11;
MOD_MASKS[SPACE]    = 7;

var CLICK_ACTION = {
    flag:       "click",
    type:       "hold",
    trigger:    [ { key:LMB, modifiers:0 } ]
};
CLICK_ACTION.trigger[0].action = CLICK_ACTION;

/*

@event cursor
    Fires whenever the mouse moves to a point within the observed area.
    @argument:String name
        The name of the [event context](#addMouseEventSource) that produced this event.
    @argument:Number x
    @argument:Number y
@event drag
    @argument:String name
        The name of the [event context](#addMouseEventSource) that produced this event.
    @argument:Number dx
    @argument:Number dy
@event click
    Fired when LMB goes up or down.
    @argument:Boolean isClicked
    @argument:Number x
    @argument:Number y
*/
function CommandController (prefs) {
    EventEmitter.call (this);

    this.prefs = prefs;

    this.cursors = {};
    this.cursorSources = {};
    this.cursorGutters = {};
    this.registry = {};
    this.activeFlags = {};
    this.modifierState = 0;
    this.buttonState = 0;
    this.dragging = false;
    this.dragAction = undefined;
    this.armedClickAction = undefined;
    this.frames = {};
    this.ui = {};
    this.activeUIRegion = undefined;
    this.draggingUIRegion = false;

    var classes = prefs.commands;
    for (var actionName in classes) {
        var actionDef = classes[actionName];
        for (var i=0,j=actionDef.trigger.length; i<j; i++) {
            var trigger = actionDef.trigger[i];
            if (KEYS[trigger.key])
                trigger.key = KEYS[trigger.key];
            var key = trigger.key;
            if (!trigger.modifiers)
                trigger.modifiers = MOD_MASKS[key] || 0;
            else {
                var mods = trigger.modifiers;
                trigger.modifiers = MOD_MASKS[key] || 0;
                for (var i=0,j=mods.length; i<j; i++)
                    trigger.modifiers += MOD_MASKS[KEYS[mods[i]]];
            }
            trigger.action = actionDef;
            if (!this.registry[key])
                this.registry[key] = [ trigger ];
            else
                this.registry[key].push (trigger);
        }
    }

    if (!this.registry[LMB])
        this.registry[LMB] = [ CLICK_ACTION.trigger[0] ];
    else
        this.registry[LMB].push (CLICK_ACTION.trigger[0]);
}
util.inherits (CommandController, EventEmitter);

CommandController.prototype.clearAllActions = function (name) {
    for (var key in this.activeFlags) {
        this.emit (key, name, false);
        delete this.activeFlags[key];
    }
    this.dragging = false;
    this.dragAction = undefined;
    this.armedClickAction = undefined;
    this.buttonState = 0;
    this.modifierState = 0;
}

CommandController.prototype.addWindow = function (name, window, frame) {
    // a shared reference with the parent context, mapping the visible window to "grid" lat/long
    this.frames[name] = frame;
    this.ui[name] = [];

    // basic window events
    var self = this;
    window.on ('blur', function(){ self.clearAllActions (name); });

    // keyboard events
    window.window.document.body.on ('keydown', function (event) {
        var key;
        if (HTML_KEYS[event.key] === undefined)
            key = event.key;
        else {
            // modifier key
            key = HTML_KEYS[event.key];
            self.modifierState |= MOD_MASKS[key];
            // re-trigger any active mouse buttons
            for (var i=1; i<8; i*=2)
                if (self.buttonState & i) {
                    var buttonTrigger = self.getTrigger (MOUSE_BUTTONS[i]);
                    if (buttonTrigger)
                        self.playTrigger (buttonTrigger, name, true, false);
                }
        }
        var trigger = self.getTrigger (key);
        if (trigger)
            self.playTrigger (trigger, name, true, false);
        return false;
    });
    window.window.document.body.on ('keyup', function (event) {
        var key;
        if (!HTML_KEYS[event.key])
            key = event.key;
        else {
            key = HTML_KEYS[event.key];
            self.modifierState &= MOD_INVERSE[key];
        }
        self.cleanupTriggers (key, name);
    });
}

var EVENT_MOVE, EVENT_LEAVE, EVENT_DOWN, EVENT_UP;
if (window.PointerEvent) {
    EVENT_MOVE = 'pointermove';
    EVENT_LEAVE = 'pointerleave';
    EVENT_DOWN = 'pointerdown';
    EVENT_UP = 'pointerup';
} else {
    EVENT_MOVE = 'mousemove';
    EVENT_LEAVE = 'mouseleave';
    EVENT_DOWN = 'mousedown';
    EVENT_UP = 'mouseup';
}
CommandController.prototype.addMouseEventSource = function (name, source, gutter) {
    this.cursorSources[name] = source;
    var cursor = {
        x:      0,
        y:      0,
        pixel:  {
            x:      0,
            y:      0
        }
    };
    this.cursors[name] = cursor;
    this.cursorGutters[name] = gutter;

    var self = this;
    var frame = this.frames[name];
    source.on (EVENT_MOVE, function (event) {
        var pressure;
        if (event.pointerType === undefined || event.pointerType === 'mouse')
            pressure = event.buttons === 1 ? 1 : 0;
        else
            pressure = event.buttons === 1 ? event.pressure : 0;

        var width = source.clientWidth - gutter[1] - gutter[3];
        var height = source.clientHeight - gutter[0] - gutter[2];
        self.eventY = event.offsetY;
        var pxX = event.offsetX - gutter[3];
        var pxY = event.offsetY - gutter[0];
        var x = Math.max (0, Math.min (1, ( pxX ) / width));
        var y = Math.max (0, Math.min (1, ( pxY ) / height));
        if (self.dragging) {
            var dx = cursor.x - x;
            var dy = cursor.y - y;
            if (self.dragAction)
                self.emit (self.dragAction.action.flag, name, dx, dy);
        }
        cursor.x = x;
        cursor.y = y;
        cursor.pixel.x = pxX;
        cursor.pixel.y = pxY;

        // preserve current lat/long in case we need the deltas
        var previousLongitude = cursor.longitude;
        var previousEquatorialLongitude = cursor.equatorialLongitude;
        var previousLatitude = cursor.latitude;

        // calculate the next lat/long
        var latitude = frame.getLatitude (pxY);
        var equatorialLongitude = frame.getEquatorialLongitude (pxX);
        var longitude = frame.getLongitude (pxX, equatorialLongitude, latitude);

        // store on the cursor
        cursor.longitude = longitude;
        cursor.latitude = latitude;
        cursor.equatorialLongitude = equatorialLongitude;

        // update a dragged UI region
        if (self.draggingUIRegion && self.activeUIRegion && self.activeUIRegion.ondrag) {
            self.activeUIRegion.ondrag (
                cursor.equatorialLongitude - previousEquatorialLongitude,
                latitude - previousLatitude,
                longitude - previousLongitude
            );
        } else if (self.buttonState === 1 && !self.draggingUIRegion)
            self.emit (
                'paint',
                name,
                pressure,
                longitude,
                latitude,
                longitude - previousLongitude,
                latitude - previousLatitude
            );

        self.checkUIRegions (name);
        self.emit ('cursor', name);
    });

    source.on (EVENT_LEAVE, function(){ self.clearAllActions (name); });

    source.on ('wheel', function (event) {
        var direction = event.deltaY < 0 ? WHEELUP : WHEELDOWN;
        var trigger = self.getTrigger (direction);
        if (trigger)
            self.playTrigger (trigger, name, true, false);
    });

    function reactToButtons (event) {
        var pressure;
        if (event.pointerType === undefined || event.pointerType === 'mouse')
            pressure = event.buttons === 1 ? 1 : 0;
        else
            pressure = event.buttons === 1 ? event.pressure : 0;

        for (var i=1; i<8; i*=2) {
            var button_down = Boolean (event.buttons & i);
            var button = MOUSE_BUTTONS[i];
            if (button_down !== Boolean (self.buttonState & i)) {
                if (i !== 1 || !self.activeUIRegion) {
                    var buttonTrigger = self.getTrigger (button);
                    if (buttonTrigger)
                        self.playTrigger (buttonTrigger, name, button_down, true);
                }
                if (button_down) {
                    self.buttonState |= i;
                    if (i === 1 && self.activeUIRegion) {
                        self.draggingUIRegion = true;
                        self.emit ('ui_click', self.activeUIRegion, true);
                        if (self.activeUIRegion.onclick)
                            self.activeUIRegion.onclick (true);
                    } else
                        self.emit (
                            'paint',
                            name,
                            pressure,
                            cursor.longitude,
                            cursor.latitude,
                            0,
                            0
                        );
                } else {
                    self.buttonState &= 7 - i;
                    if (i === 1) {
                        self.draggingUIRegion = false;
                        if (self.activeUIRegion) {
                            self.emit ('ui_click', self.activeUIRegion, false);
                            if (self.activeUIRegion.onclick)
                                self.activeUIRegion.onclick (false);
                        } else
                            self.emit (
                                'paint',
                                name,
                                pressure,
                                cursor.longitude,
                                cursor.latitude,
                                0,
                                0
                            );
                    }
                }
            }
        }
    }
    source.on (EVENT_DOWN, reactToButtons);
    source.on (EVENT_UP, reactToButtons);

    return cursor;
};

CommandController.prototype.getTrigger = function (key, event) {
    var candidates = this.registry[key];
    if (!candidates)
        return undefined;
    for (var i=0,j=candidates.length; i<j; i++) {
        if (candidates[i].modifiers === this.modifierState)
            return candidates[i];
    }
};

CommandController.prototype.playTrigger = function (trigger, sourceName, isActive, sendCursor) {
    // drag triggers are armed to trigger when dragging occurs
    if (trigger.action.type === 'drag') {
        this.dragging = Boolean (this.dragAction = isActive ? trigger : undefined);
        return;
    }

    // click triggers are "armed" on button down and triggered on button up
    if (trigger.action.type === 'click') {
        if (isActive)
            this.armedClickAction = trigger;
        else if (this.armedClickAction === trigger.action) {
            if (sendCursor)
                this.emit (trigger.action.flag, sourceName, this.cursors[sourceName].x, this.cursors[sourceName].y);
            else
                this.emit (trigger.action.flag, sourceName);
        }
        return;
    }

    // event triggers emit a single event immediately on keydown, mousedown, etc.
    if (trigger.action.type === 'event') {
        if (isActive)
            this.emit (trigger.action.flag, sourceName);
        return;
    }

    // hold triggers send a boolean for their on/off state when their keys go up and down
    // trigger.action.type === 'hold'
    if (isActive) {
        if (trigger.key in this.activeFlags) {
            if (this.activeFlags[trigger.key].indexOf (trigger) < 0)
                this.activeFlags[trigger.key].push (trigger);
        } else {
            this.activeFlags[trigger.key] = [ trigger ];
            if (sendCursor)
                this.emit (trigger.action.flag, sourceName, true, this.cursors[sourceName].x, this.cursors[sourceName].y);
            else
                this.emit (trigger.action.flag, sourceName, true);
        }
    } else if (trigger.key in this.activeFlags) {
        // remove the no-longer active trigger from activeFlags
        var triggers = this.activeFlags[trigger.key];
        var location = triggers.indexOf (trigger);
        if (location >= 0) {
            triggers.splice (location, 1);
            this.emit (trigger.action.flag, sourceName, false);
            if (!triggers.length)
                delete this.activeFlags[trigger.key];
        }
    }
};

CommandController.prototype.cleanupTriggers = function (key, sourceName) {
    // cleanup actions triggered by the key
    if (key in this.activeFlags) {
        var triggers = this.activeFlags[key];
        for (var i=0,j=triggers.length; i<j; i++)
            this.emit (triggers[i].action.flag, sourceName, false);
        delete this.activeFlags[key];
    }

    // if the key is a modifier, cleanup any action triggered by a key with this modifier
    var mask;
    if (key in MOD_MASKS) {
        mask = MOD_MASKS[key];
        for (var anykey in this.activeFlags) {
            var triggers = this.activeFlags[anykey];
            for (var i=triggers.length-1; i>=0; i--) {
                var trigger = triggers[i];
                if (trigger.modifiers & mask) {
                    this.emit (trigger.action.flag, sourceName, false);
                    triggers.splice (i, 1);
                }
            }
            if (!triggers.length)
                delete this.activeFlags[anykey];
        }
    }

    // check the dragAction
    if (
        this.dragAction
     && (
            this.dragAction.key === trigger
         || ( mask && this.dragAction.modifiers & mask )
        )
    )
        this.dragAction = undefined;
};

/*  @class UIRegionConfig
@json nw
    @member:Number nw#x
    @member:Number nw#y
@json se
    @member:Number se#x
    @member:Number se#y
@json margin
    @member:Number margin#x
    @member:Number margin#y
@json drag
    @member:Boolean drag#x
    @member:Boolean drag#y
@member:String cursor
@member:Function onhover
@member:Function onclick
@member:Function ondrag
*/
/*  @class UIRegion
@member:Function move
@member:Function dispose
*/
/*
@argument:String sourceName
@argument:.UIRegionConfig config
@returns:.UIRegion
*/
CommandController.prototype.addUIRegion = function (sourceName, config, callback) {
    this.ui[sourceName].push (config);
    this.checkUIRegions (sourceName);
};

CommandController.prototype.clearUIRegions = function (sourceName) {
    this.ui[sourceName].splice (0, this.ui[sourceName].length);
    if (this.activeUIRegion) {
        this.emit ('ui_hover', sourceName, this.activeUIRegion, false);
        if (this.activeUIRegion.onhover)
            this.activeUIRegion.onhover (false);
        if (this.draggingUIRegion && this.activeUIRegion.onclick)
            this.activeUIRegion.onclick (false);
        this.activeUIRegion = undefined;
    }
};

CommandController.prototype.checkUIRegions = function (sourceName) {
    var sourceCanvas = this.cursorSources[sourceName];
    var gutter = this.cursorGutters[sourceName];
    var frame = this.frames[sourceName];
    var resX = sourceCanvas.width - gutter[3];
    var resY = sourceCanvas.height - gutter[0];
    var cursor = this.cursors[sourceName];
    var x = cursor.pixel.x;
    var y = cursor.pixel.y;

    var ui = this.ui[sourceName];
    var winner, winningDistance = Infinity;
    for (var i=0,j=ui.length; i<j; i++) {
        var uiDef = ui[i];
        var nwX = Math.round (
            (resX / 2)
          + ((uiDef.nw.x - frame.center.x) / frame.degreesPerPixel)
        );
        if (x < nwX - uiDef.margin.x)
            continue;

        var nwY = Math.round (
            (resY / 2)
          - ((uiDef.nw.y - frame.center.y) / frame.degreesPerPixel)
        );
        if (y < nwY - uiDef.margin.y)
            continue;

        var seX = Math.round (
            (resX / 2)
          + ((uiDef.se.x - frame.center.x) / frame.degreesPerPixel)
        );
        if (x > seX + uiDef.margin.x)
            continue;

        var seY = Math.round (
            (resY / 2)
          - ((uiDef.se.y - frame.center.y) / frame.degreesPerPixel)
        );
        if (y > seY + uiDef.margin.y)
            continue;

        // user is hovering over this UI element!
        // what is their margin distance?
        var distance = Math.min (
            Math.max (nwX - x, Math.max (0, -1 * (seX - x))),
            Math.max (nwY - y, Math.max (0, -1 * (seY - y)))
        );
        if (distance < winningDistance)
            winner = uiDef;
    }

    if (winner) {
        if (!this.activeUIRegion) {
            this.activeUIRegion = winner;
            this.emit ('ui_hover', sourceName, this.activeUIRegion, true);
            if (winner.onhover)
                winner.onhover (true);
        }
    } else if (this.activeUIRegion) {
        this.emit ('ui_hover', sourceName, this.activeUIRegion, false);
        if (this.activeUIRegion.onhover)
            this.activeUIRegion.onhover (false);
        this.activeUIRegion = undefined;
    }
};

CommandController.prototype.openConfigWindow = function(){

};

module.exports = CommandController;
