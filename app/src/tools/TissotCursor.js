
var FATNESS = 0.49;

function TissotCursor (target, frame, cursor, radius) {
    var r = Math.ceil (radius);
    var r_ish = r + FATNESS;
    var r2 = r_ish * r_ish;

    var traceX = r;
    var traceY = 0;
    var topCenter, bottomCenter;
    var canonX = frame.getX (cursor.longitude, cursor.equatorialLongitude, cursor.latitude);
    var upMidCenter = canonX;
    var lowMidCenter = canonX;
    var topLat = cursor.latitude;
    var bottomLat = cursor.latitude;
    var points = Array (4 * r + 2);
    var halfLen = 2 * r;
    if (topLat <= 90 && bottomLat >= -90) {
        points[halfLen] = canonX;
        points[halfLen+1] = r;
    }
    // console.log (cursor.longitude, cursor.latitude, frame.degreesPerPixel);
    for (var i=2; i<halfLen+2; i+=2) {
        traceY++;
        while ((traceX * traceX) + (traceY * traceY) > r2)
            traceX--;

        topLat += frame.degreesPerPixel;
        if (topLat <= 90) {
            points[halfLen-i] = frame.getX (cursor.longitude, cursor.equatorialLongitude, topLat);
            points[halfLen-i+1] = traceX;
        }

        bottomLat -= frame.degreesPerPixel;
        if (bottomLat >= -90) {
            points[halfLen+i] = frame.getX (cursor.longitude, cursor.equatorialLongitude, bottomLat);
            points[halfLen+i+1] = traceX;
        }
    }

    var index = 0;
    while (points[index] === undefined)
        index += 2;
    console.log ('skipped', index);
    var center = points[index];
    var x = points[index+1];
    var right = center + x;
    var left = center - x;
    var lastRight = center - 1;
    var lastLeft = center + 1;
    index += 2;
    var nextLeft, nextRight;
    var drawY = frame.getY (cursor.latitude) - r;
    // console.log ('pix='+cursor.pixel.y, 'can='+(drawY+r));
    while (true) {
        if (points[index] !== undefined) {
            center = points[index];
            x = points[index+1];
            nextRight = center + x;
            nextLeft = center - x;
        } else {
            nextRight = center - 1;
            nextLeft = center + 1;
            center = undefined;
            x = undefined;
        }

        var previous = Math.min (lastRight, nextRight);
        var position = right > previous ? previous + 1 : previous;
        var width = Math.max (1, right - position + 1);

        // draw right
        target.fillRect (
            position,
            drawY,
            width,
            1
        );

        // draw left
        target.fillRect (
            left,
            drawY,
            Math.max (1, Math.abs (Math.max (nextLeft, lastLeft) - left)),
            1
        );

        // update caret
        if (center === undefined)
            break;
        lastRight = right;
        lastLeft = left;
        right = nextRight;
        left = nextLeft;
        index += 2;
        drawY++;
    }
}

module.exports = TissotCursor;
