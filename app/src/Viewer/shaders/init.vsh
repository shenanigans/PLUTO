#version 300 es

precision highp float;
precision highp int;

in vec2 point;

out vec2 coord;

void main(){
    coord = vec2(point);
    float x = max (-1.0, min (1.0, point[0] / 180.0));
    float y = max (-1.0, min (1.0, point[1] / 90.0));
    gl_Position = vec4 (x, y, 0, 1);
}
