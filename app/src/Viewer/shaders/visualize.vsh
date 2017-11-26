#version 300 es

precision highp float;
precision highp int;

in vec2 point;
in vec2 in_texturePoint;
out vec2 texturePoint;

void main() {
    texturePoint = in_texturePoint;
    gl_Position = vec4 (point, 0, 1);
}
