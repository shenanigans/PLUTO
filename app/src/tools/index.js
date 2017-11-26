
var ProjectionEditor    = require ('./ProjectionEditor');
var DevBrush            = require ('./DevBrush');

module.exports = function (canvas, context, editor, eventSourceName, setCursor) {
    return {
        ProjectionEditor:   new ProjectionEditor (
            canvas,
            context,
            editor,
            eventSourceName,
            setCursor
        ),
        DevBrush:           new DevBrush (
            canvas,
            context,
            editor,
            eventSourceName,
            setCursor
        )
    };
};
