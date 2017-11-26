
// console hack
global.console = console;

var BASE_PLANET = require ('./BasePlanet.json');

try {

    var CommandController = require ('./CommandController');
    var Editor = require ('./Editor');
    var Planet = require ('./Planet');
    var gui = require ('nw.gui');

    // HACK
    var prefs = require ('./default_prefs.json');

    // HACK open dev tools after startup
    var launchWindow = gui.Window.get();
    launchWindow.on ('loaded', function(){
        launchWindow.show();
        setTimeout (function(){
            launchWindow.showDevTools();
        }, 1500);
    });

    // HACK launch editor window immediately with an empty Planet
    gui.Window.open ('src/editor.html', {
        position: "center",
        width: 1000,
        height: 800
    }, function (editorWinnder) {
        var controller = new CommandController (prefs);
        var newPlanet = new Planet (BASE_PLANET);
        // create the editor instance
        var editor = new Editor (editorWinnder, prefs, controller, newPlanet);
        editorWinnder.on ('closed', function(){
            gui.App.quit();
        });

        // initialize planet
        editorWinnder.on ('loaded', function(){
            setTimeout (function(){
                editor.viewer.mainProjector.initialize (editor.planet.baseFragment, 'dev', {});
                editor.viewer.draw();
            }, 500);
        });
    });

} catch (err) {
    console.log ('startup error', err);
}
