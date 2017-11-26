
function BaseLevel (document, planet, src) {
    this.planet = planet;
    this.image = document.createElement ('img');
    this.image.setAttribute ('src', src);

    this.listeners = [];

    this.frame = {
        width:  360,
        height: 180,
        center: { x:0, y:0 }
    };

    function ready(){ self.emit(); }
    if (Boolean (image.width))
        process.nextTick (ready);
    else
        image.onload = ready;
}

BaseLevel.prototype.emit = function(){
    this.isReady = true;
    for (var i=0,j=this.listeners.length; i<j; i++)
        this.listeners[i]();
}

BaseLevel.prototype.ondata = function (fn) {
    this.listeners.push (fn);
    if (this.isReady)
        fn();
};

BaseLevel.prototype.dropListener = function (fn) {
    var i = this.listeners.indexOf (fn);
    if (i >= 0)
        this.listeners.splice (i, 1);
};

module.exports = BaseLevel;
