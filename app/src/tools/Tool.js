
function Tool (canvas, context, editor, eventSourceName, setCursor) {
    this.listeners = {};

    this.document = canvas.ownerDocument;
    this.canvas = canvas;
    this.context = context;
    this.editor = editor;
    this.controller = editor.controller;
    this.cursor = editor.cursor;
    this.frame = editor.frame;
    this.eventSourceName = eventSourceName;
    this.setCursor = setCursor;

    this.propsBar = this.document.createElement ('div');
    this.propsBar.className = 'ToolProps';
    this.propsBar.id = 'props_' + this.info.id;
}

Tool.prototype.subscribe = function (eventName, reactor) {
    if (this.listeners[eventName])
        throw new Error ('only one reactor per controller event permitted');
    this.listeners[eventName] = reactor;
};

Tool.prototype.start = function (planet) {
    this.planet = planet;
    for (var eventName in this.listeners)
        this.controller.on (eventName, this.listeners[eventName]);
    this.setCursor (this.info.cursor || 'default', this.info.crosshair);
};

Tool.prototype.stop = function(){
    for (var eventName in this.listeners)
        this.controller.removeListener (eventName, this.listeners[eventName]);
    this.context.clearRect (0, 0, this.canvas.width, this.canvas.height);
    this.propsBar.dispose();
    this.controller.clearUIRegions (this.eventSourceName);
};

Tool.prototype.draw = function(){
    // nothing to do here
};

module.exports = Tool;
