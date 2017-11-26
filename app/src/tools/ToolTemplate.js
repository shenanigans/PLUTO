
var Tool = require ('./Tool');
var util = require ('util');

function ToolTemplate(){
    Tool.apply (this, arguments);
}
util.inherits (ToolTemplate, Tool);
ToolTemplate.prototype.info = {
    title:      "Empty Tool Template",
    id:         "ERROR"
};

ToolTemplate.prototype.start = function (planet) {
    Tool.prototype.start.call (this, planet);

    this.setCursor ('precision');
};

ToolTemplate.prototype.draw = function (frame) {

};

ToolTemplate.prototype.paint = function (dLong, dLat) {

};

module.exports = ToolTemplate;
