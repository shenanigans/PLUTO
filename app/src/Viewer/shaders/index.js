
var compile = require ('./compile');
var fs = require ('fs');

var dir = './src/Viewer/shaders/';
var list = fs.readdirSync (dir);
module.exports = { fragment:{}, vertex:{}, compile:function (context) {
    return compile (context, {
        vertex:     module.exports.vertex,
        fragment:   module.exports.fragment
    });
} };
// populate by loading the text of all local files
// with either .vsh or .fsh postfix
for (var i=0,j=list.length; i<j; i++) {
    var fname = list[i];
    if (fname.slice (-4) === '.vsh')
        module.exports.vertex[fname.slice (0, -4)] = fs.readFileSync (dir + fname).toString();
    if (fname.slice (-4) === '.fsh')
        module.exports.fragment[fname.slice (0, -4)] = fs.readFileSync (dir + fname).toString();
}
