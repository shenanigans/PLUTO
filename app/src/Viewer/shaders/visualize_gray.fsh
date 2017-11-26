#version 300 es

precision highp float;
precision highp int;

uniform sampler2D image;
uniform int center;
uniform int width;

in vec2 texturePoint;
out vec4 color;

const float WHITE = pow(2.0, 24.0) - 1.0;

void main() {
    vec4 pixel = texture (image, texturePoint);
    if (pixel.a == 0.0) {
        color = vec4 (0, 0, 0, 0);
        return;
    }
    int grayI =
        (int(pixel.r * 255.0) << 16)
      + (int(pixel.g * 255.0) << 8)
      + int(pixel.b * 255.0)
      ;
    float gray = float(grayI) / WHITE;
    color = vec4 (pixel.r, pixel.r, pixel.r, pixel.a);
}
