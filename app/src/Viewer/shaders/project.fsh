#version 300 es

precision highp float;
precision highp int;

uniform int resolution;
uniform vec2 frame;
uniform vec2 frame_center;
uniform vec2 viewportSize;
uniform int altitude;
uniform sampler2D terrain;
uniform sampler2D context;
uniform vec4 texture_frame;
uniform int texture_altitude;
uniform int texture_lod;
uniform float degreesPerTexel;
uniform float horizontalTexels;
uniform float verticalTexels;
uniform int texture_zeroOffset;

flat in float center;
flat in float edge;

out vec4 color;

float BSpline (float x);
float BSpline (float x) {
    float f = x;
    if (f < 0.0)
        f = -f;

    if (f >= 0.0 && f <= 1.0)
        return (2.0 / 3.0) + 0.5 * f * f * f - f * f;

    else if (f > 1.0 && f <= 2.0)
        return 1.0 / 6.0 * pow((2.0 - f), 3.0);

    return 1.0;
}

vec2 globalCoordinate (float fragX, float fragY);
vec2 globalCoordinate (float fragX, float fragY) {
    // fetch latitude
    highp float latitude =
        frame_center[1]
      + ((gl_FragCoord[1] - 0.5 - floor (viewportSize[1] / 2.0)) / viewportSize[1]) * frame[1] * 2.0
      ;

    // fetch grid longitude and project real longitude
    highp float compressionFactor = cos (radians (latitude));
    if (compressionFactor == 0.0)
        return vec2 (0.0, latitude);
    highp float longitude_grid =
        frame_center[0]
      + ((gl_FragCoord[0] - 0.5 - floor (viewportSize[0] / 2.0)) / viewportSize[0]) * frame[0] * 2.0
      ;

    return vec2 (center + ((longitude_grid - center) / compressionFactor), latitude);
}

vec2 textureCoordinate (vec2 position);
vec2 textureCoordinate (vec2 position, float compressionFactor) {
    float offsetX = (texture_frame[1] + texture_frame[3]) / 2.0;
    float offsetY = (texture_frame[0] + texture_frame[2]) / 2.0;
    return vec2 (
        (horizontalTexels / 2.0) + ((compressionFactor * (position.x - offsetX)) / degreesPerTexel),
        (position.y - offsetY + 90.0) / degreesPerTexel
    );
}

float longitudeForTexCoord (int x, float localDegreesPerTexel);
float longitudeForTexCoord (int x, float localDegreesPerTexel) {
    return float(x + texture_zeroOffset) * localDegreesPerTexel;
}

float latitudeForTexCoord (int y);
float latitudeForTexCoord (int y) {
    return texture_frame[2] + float(y) * degreesPerTexel;
}

void main() {
    vec2 fragPosition = globalCoordinate (gl_FragCoord.x, gl_FragCoord.y);

    // are we within the drawn portion of the projection?
    if (edge < center) {
        if (fragPosition.x < edge) {
            color = vec4 (0, 0, 0, 0);
            return;
        }
    } else if (fragPosition.x > edge) {
        color = vec4 (0, 0, 0, 0);
        return;
    }

    // are we within the bounds of the texture?
    if (
        fragPosition.y > texture_frame[0]
     || fragPosition.y < texture_frame[2]
     || fragPosition.x > texture_frame[1]
     || fragPosition.x < texture_frame[3]
    )
        return;

    // compression factor at the current fragment row
    highp float compressionFactor = cos (radians (fragPosition.y));


    // same altitude
    if (altitude == texture_altitude) {
        vec2 pos = textureCoordinate (fragPosition, compressionFactor);
        ivec2 ipos = ivec2 (int(pos.x), int(pos.y));
        color = texelFetch (terrain, ipos, texture_lod);
        return;
    }


    // magnify
    vec2 pointCoord = textureCoordinate (fragPosition, compressionFactor);
    float roundLat = latitudeForTexCoord (int (floor (pointCoord.y)));
    vec2 pointPosition = vec2 (
        longitudeForTexCoord (int (floor (pointCoord.x)), degreesPerTexel / cos (radians (roundLat))),
        roundLat
    );
    if (altitude > texture_altitude) {
        vec4 nSum = vec4( 0.0, 0.0, 0.0, 0.0 );
        vec4 nDenom = vec4( 0.0, 0.0, 0.0, 0.0 );
        float a = fract (pointCoord.x);
        float b = fract (pointCoord.y);

        float[4] localCompressionFactor = float[4](
            cos (radians (pointPosition.y - degreesPerTexel)),
            cos (radians (pointPosition.y)),
            cos (radians (pointPosition.y + degreesPerTexel)),
            cos (radians (pointPosition.y + degreesPerTexel + degreesPerTexel))
        );
        float[4] localDegreesPerTexel = float[4](
            degreesPerTexel / localCompressionFactor[0],
            degreesPerTexel / localCompressionFactor[1],
            degreesPerTexel / localCompressionFactor[2],
            degreesPerTexel / localCompressionFactor[3]
        );

        for (int xOffset=-1; xOffset<=2; xOffset++) {
            for (int yOffset=-1; yOffset<=2; yOffset++) {
                int texX = int(floor(pointCoord.x)) + xOffset;
                int texY = int(floor(pointCoord.y)) + yOffset;

                // is this ok or do we need to wrap around the texture?
                float sampleLong = longitudeForTexCoord (texX, localDegreesPerTexel[yOffset+1]);
                if (sampleLong > 180.0 || sampleLong < -180.0) {
                    float rowWidth = round (horizontalTexels * localCompressionFactor[yOffset+1]);
                    texX -= int(rowWidth * sign(sampleLong));
                }

                // sample the texture
                vec4 vecData;
                if (texX < 0 || float(texX) >= horizontalTexels)
                    vecData = vec4 (0,0,1,1);
                else
                    vecData = texelFetch (terrain, ivec2 (texX, texY), texture_lod);

                float f = BSpline (float(xOffset) - a);
                vec4 vecCooef1 = vec4 (f, f, f, f);
                float f1 = BSpline (-(float(yOffset) - b));
                vec4 vecCoeef2 = vec4 (f1, f1, f1, f1);
                nSum = nSum + (vecData * vecCoeef2 * vecCooef1);
                nDenom = nDenom + ((vecCoeef2 * vecCooef1));
            }
        }

        color = nSum / nDenom;
        return;
    }


    // minimize
    float samplesPerFrag = float(texture_altitude) / float(altitude);
}
