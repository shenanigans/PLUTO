#version 300 es

precision highp float;
precision highp int;

in vec2 coord;

out vec4 color;

const int mask_r = 255 << 16;
const float mask_f_r = float(mask_r);
const int mask_g = 255 << 8;
const float mask_f_g = float(mask_g);
const int mask_b = 255;
const float mask_f_b = float(mask_b);

void main(){
    float longitude = coord[0] / cos (radians(coord[1]));
    if (longitude < -180.0) {
        if (longitude + 0.00000002 >= -180.0)
            longitude = -180.0;
        else {
            color = vec4 (0, 0, 0, 0);
            return;
        }
    }
    if (longitude > 180.0) {
        if (longitude - 0.00000002 <= 180.0)
            longitude = 180.0;
        else {
            color = vec4 (0, 0, 0, 0);
            return;
        }
    }
    float height = (1.0 + cos (radians(longitude * 5.0))) / 2.0;
    int iHeight = int ((pow (2.0, 24.0) - 1.0) * height);
    float r = float(iHeight & mask_r) / mask_f_r;
    float g = float(iHeight & mask_g) / mask_f_g;
    float b = float(iHeight & mask_b) / mask_f_b;
    color = vec4 (r, g, b, 1.0);
}
