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

in vec2 point;
in float start;
in float end;
in float isRising;

flat out float center;
flat out float edge;

void main() {
    if (isRising > 0.5) {
        center = end;
        edge = start;
    } else {
        center = start;
        edge = end;
    }
    gl_Position = vec4 (
        (point[0] - frame_center[0]) / frame[0],
        (point[1] - frame_center[1]) / frame[1],
        0,
        1
    );
}
