#version 300 es

precision highp float;
precision highp int;

uniform sampler2D image;

in vec2 texturePoint;
out vec4 color;

void main() {
    color = texture (image, texturePoint);
}
