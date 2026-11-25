/* 栖园 — GLSL sources (WebGL2 / GLSL ES 3.00) */
window.QY_GLSL = (function () {
  const VS = `#version 300 es
in vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`;

  const COMMON = `#version 300 es
precision highp float;
precision highp int;
out vec4 fragColor;
uniform vec2 u_res;
uniform float u_time;

#define PI 3.14159265359
float hash11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
// baked noise: n1 = four tileable fbm fields, n2 = four smooth value-noise fields (32 cells per tile), n3 = white noise
uniform sampler2D u_n1;
uniform sampler2D u_n2;
uniform sampler2D u_n3;
#define N1(c) texture(u_n1, (c))
#define N2(c) texture(u_n2, (c))
#define N3(c) texture(u_n3, (c))
// bump-map any scalar height field onto a surface using screen-space derivatives (no tangents needed)
vec3 bumpNormal(vec3 n, vec3 p, float h, float amp){
  vec3 dpx = dFdx(p), dpy = dFdy(p);
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - amp * grad);
}
float sdCapsule(vec3 p, vec3 a, vec3 b, float r){ vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h) - r; }
float smin(float a, float b, float k){ float h = clamp(.5 + .5 * (b - a) / k, 0., 1.); return mix(b, a, h) - k * h * (1. - h); }
float sdBox(vec3 p, vec3 b){ vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float segSegDist(vec3 p1, vec3 q1, vec3 p2, vec3 q2){
  vec3 d1 = q1 - p1, d2 = q2 - p2, r = p1 - p2;
  float a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r), c = dot(d1, r), b = dot(d1, d2);
  float den = a * e - b * b;
  float s = den > 1e-6 ? clamp((b * f - c * e) / den, 0.0, 1.0) : 0.0;
  float t = (b * s + f) / e;
  if (t < 0.0){ t = 0.0; s = clamp(-c / a, 0.0, 1.0); } else if (t > 1.0){ t = 1.0; s = clamp((b - c) / a, 0.0, 1.0); }
  return length((p1 + d1 * s) - (p2 + d2 * t));
}
float raySeg(vec3 ro, vec3 rd, vec3 a, vec3 b, float r){
  vec3 ba = b - a, oa = ro - a;
  float baba = dot(ba, ba), bard = dot(ba, rd), baoa = dot(ba, oa);
  float rdoa = dot(rd, oa), oaoa = dot(oa, oa);
  float A = baba - bard * bard, B = baba * rdoa - baoa * bard, C = baba * oaoa - baoa * baoa - r * r * baba;
  float h = B * B - A * C;
  if (h >= 0.0){ float t = (-B - sqrt(h)) / A; float y = baoa + t * bard; if (y > 0.0 && y < baba && t > 0.0) return t; }
  return -1.0;
}
// 3x5 pixel font, digits 0-9
const int FONT[10] = int[10](0x7B6F, 0x2C97, 0x73E7, 0x73CF, 0x5BC9, 0x79CF, 0x79DF, 0x7252, 0x7BDF, 0x7BCF);
float glyph(int d, vec2 uv){
  int col = int(clamp(uv.x, 0.0, 0.999) * 3.0), row = 4 - int(clamp(uv.y, 0.0, 0.999) * 5.0);
  return float((FONT[clamp(d, 0, 9)] >> (row * 3 + col)) & 1);
}
float rectMask(vec2 uv, vec2 c, vec2 hf){ vec2 d = abs(uv - c) - hf; return step(max(d.x, d.y), 0.0); }
// viewer's right-hand direction for a surface whose outward normal is n
vec3 faceRight(vec3 n){ return cross(vec3(0.0, 1.0, 0.0), n); }
vec2 faceUV(vec3 p, vec3 centre, vec3 n, vec2 size){ return vec2(dot(p - centre, faceRight(n)) / size.x + 0.5, (p.y - centre.y) / size.y + 0.5); }
`;

  // The figure. Shared by both scenes so it is literally the same thing everywhere.
  const FIGURE = `
uniform vec2 u_fig;        // x, z
uniform float u_figOn;
uniform float u_figYaw;
uniform vec3 u_figPose;    // x: head tilt (rad), y: reach, z: mouth open
uniform float u_anim;
uniform float u_eyes;
const vec3 EYE1 = vec3(0.039, 0.022, -0.090);
const vec3 EYE2 = vec3(-0.037, 0.016, -0.090);
const vec2 MOUTH_C = vec2(0.004, -0.070);

float sdFigure(vec3 p, out float mat){
  mat = 0.0;
  p -= vec3(u_fig.x, 0.0, u_fig.y);
  if (abs(u_figYaw) > 0.001) p.xz = rot(u_figYaw) * p.xz;
  p.x -= sin(u_anim * 0.9) * 0.008 * p.y;
  float reach = u_figPose.y;
  vec3 h1 = mix(vec3(0.235, 0.50, -0.015), vec3(0.15, 1.38, -0.52), reach);
  vec3 h2 = mix(vec3(-0.235, 0.50, -0.02), vec3(-0.15, 1.38, -0.52), reach);
  float d = sdCapsule(p, vec3(0.10, -0.02, 0.02), vec3(0.118, 0.55, -0.01), 0.062);
  d = smin(d, sdCapsule(p, vec3(0.118, 0.55, -0.01), vec3(0.095, 1.02, 0.01), 0.07), 0.06);
  d = smin(d, sdCapsule(p, vec3(-0.10, -0.02, 0.0), vec3(-0.112, 0.55, 0.03), 0.062), 0.07);
  d = smin(d, sdCapsule(p, vec3(-0.112, 0.55, 0.03), vec3(-0.095, 1.02, -0.01), 0.07), 0.06);
  vec3 pq = p - vec3(0.0, 1.05, 0.01);
  d = smin(d, (length(pq / vec3(0.135, 0.17, 0.10)) - 1.0) * 0.095, 0.08);
  vec3 cq = p - vec3(0.0, 1.40, 0.045);
  d = smin(d, (length(cq / vec3(0.168, 0.235, 0.115)) - 1.0) * 0.11, 0.09);
  d = smin(d, sdCapsule(p, vec3(-0.185, 1.575, 0.035), vec3(0.185, 1.575, 0.035), 0.046), 0.05);
  float a1 = smin(sdCapsule(p, vec3(0.205, 1.565, 0.035), h1, 0.038), length(p - h1) - 0.047, 0.03);
  float a2 = smin(sdCapsule(p, vec3(-0.205, 1.565, 0.035), h2, 0.038), length(p - h2) - 0.047, 0.03);
  d = smin(d, min(a1, a2), 0.035);
  d = smin(d, sdCapsule(p, vec3(0.0, 1.56, 0.035), vec3(0.0, 1.70, 0.025), 0.040), 0.03);
  vec3 hp = p - vec3(0.0, 1.815, 0.02);
  hp.xy = rot(u_figPose.x) * hp.xy;
  hp.yz = rot(0.10 + reach * 0.22) * hp.yz;
  hp.x /= mix(1.0, 0.66, smoothstep(-0.01, -0.13, hp.y));
  float head = (length(hp / vec3(0.090, 0.146, 0.104)) - 1.0) * 0.085;
  head = smin(head, sdCapsule(hp, vec3(-0.05, 0.050, -0.084), vec3(0.05, 0.050, -0.084), 0.011), 0.012);
  float e1 = length(hp - EYE1) - 0.0295;
  float e2 = length(hp - EYE2) - 0.0265;
  float mouth = (length((hp - vec3(MOUTH_C, -0.078)) / vec3(0.036, 0.046 * u_figPose.z, 0.05)) - 1.0) * 0.023;
  float c1 = length(hp - vec3(0.064, -0.032, -0.076)) - 0.022;
  float c2 = length(hp - vec3(-0.064, -0.032, -0.076)) - 0.022;
  head = max(max(max(max(head, -e1), -e2), -mouth), max(-c1, -c2));
  head = smin(head, sdCapsule(hp, vec3(0.0, 0.012, -0.096), vec3(0.0, -0.034, -0.108), 0.0095), 0.008);
  d = smin(d, head, 0.02);
  if (p.y > 1.665 || (p.y > 1.56 && length(p.xz - vec2(0.0, 0.03)) < 0.07)) mat = 1.0;
  if (length(p - h1) < 0.05 || length(p - h2) < 0.05) mat = 1.0;
  if (e1 < 0.0 || e2 < 0.0 || mouth < 0.0) mat = 2.0;
  return d;
}
// skin detail: torn skin around the mouth, bruised sockets, mottling
vec3 figureLocal(vec3 p);
vec3 skinAlbedo(vec3 p){
  vec3 hp = figureLocal(p);
  vec2 mq = hp.xy - MOUTH_C;
  float md = length(mq);
  float crack = smoothstep(0.70, 0.78, N2(vec2(atan(mq.y, mq.x) * 0.219, md * 1.875)).r) * (1.0 - smoothstep(0.030, 0.080, md));
  float front = 1.0 - smoothstep(-0.05, -0.02, hp.z);
  float ring = max(1.0 - smoothstep(0.030, 0.050, length(hp.xy - EYE1.xy)), 1.0 - smoothstep(0.027, 0.046, length(hp.xy - EYE2.xy))) * front;
  float vein = smoothstep(0.52, 0.62, N1(vec2(p.x * 1.4 + p.z, p.y * 1.3 - p.z * 0.8)).b);
  vec3 a = vec3(0.56, 0.525, 0.495) * (0.82 + 0.36 * N1(vec2(p.x * 0.85 + p.z * 0.5, p.y * 0.8 - p.z * 0.4)).r);
  a = mix(a, a * vec3(0.62, 0.66, 0.78), vein * 0.55);
  return mix(a, a * vec3(0.35, 0.30, 0.34), max(ring * 0.8, crack * 0.9));
}
vec3 figureLocal(vec3 p){
  p -= vec3(u_fig.x, 0.0, u_fig.y);
  if (abs(u_figYaw) > 0.001) p.xz = rot(u_figYaw) * p.xz;
  vec3 hp = p - vec3(0.0, 1.815, 0.02);
  hp.xy = rot(u_figPose.x) * hp.xy;
  hp.yz = rot(0.10 + u_figPose.y * 0.22) * hp.yz;
  hp.x /= mix(1.0, 0.66, smoothstep(-0.01, -0.13, hp.y));
  return hp;
}
// the eyes catch the light wherever the viewer stands: the pale ring always faces the camera
// (a socket is a concave bowl, so its visible surface normal points from the hit toward the eye centre)
float eyeGlow(vec3 p, vec3 cam){
  vec3 hp = figureLocal(p), cp = figureLocal(cam);
  // a pinpoint up close, a pair of shining points from far away: the spot keeps a roughly constant size on screen
  float a1 = clamp(0.0035 * length(cp - EYE1) / 0.0295, 0.02, 1.0);
  float a2 = clamp(0.0035 * length(cp - EYE2) / 0.0295, 0.02, 1.0);
  float g1 = 1.0 - smoothstep(a1 * 0.6, a1, acos(clamp(dot(normalize(EYE1 - hp), normalize(cp - EYE1)), -1.0, 1.0)));
  float g2 = 1.0 - smoothstep(a2 * 0.6, a2, acos(clamp(dot(normalize(EYE2 - hp), normalize(cp - EYE2)), -1.0, 1.0)));
  return g1 + g2;
}
vec3 figureNormal(vec3 p){
  float m; const vec2 e = vec2(0.0012, -0.0012);
  return normalize(e.xyy * sdFigure(p + e.xyy, m) + e.yyx * sdFigure(p + e.yyx, m) + e.yxy * sdFigure(p + e.yxy, m) + e.xxx * sdFigure(p + e.xxx, m));
}
float traceFigure(vec3 ro, vec3 rd, float tmax, out float mat){
  mat = 0.0;
  vec3 oc = ro - vec3(u_fig.x, 0.0, u_fig.y);
  float R = 0.62, a = dot(rd.xz, rd.xz), t = 0.0, tl = tmax;
  if (a > 1e-6){
    float b = dot(oc.xz, rd.xz), c = dot(oc.xz, oc.xz) - R * R, h = b * b - a * c;
    if (h < 0.0) return -1.0;
    h = sqrt(h);
    float t0 = (-b - h) / a, t1 = (-b + h) / a;
    if (t1 < 0.0 || t0 > tmax) return -1.0;
    t = max(t0, 0.0); tl = min(tmax, t1 + 0.05);
    float y0 = ro.y + rd.y * t, y1 = ro.y + rd.y * min(t1, tmax);
    if (min(y0, y1) > 2.1 || max(y0, y1) < -0.05) return -1.0;
  } else if (dot(oc.xz, oc.xz) > R * R) return -1.0;
  for (int i = 0; i < 80; i++){
    float d = sdFigure(ro + rd * t, mat);
    if (d < 0.0012 * (1.0 + t * 0.25)) return t;
    t += d * 0.85;
    if (t > tl) break;
  }
  return -1.0;
}
float figAO(vec3 p, vec3 n){
  float occ = 0.0, sca = 1.0, m;
  for (int i = 1; i <= 4; i++){
    float h = 0.012 + 0.03 * float(i);
    float d = sdFigure(p + n * h, m);
    occ += (h - d) * sca; sca *= 0.75;
  }
  return clamp(1.0 - 2.2 * occ, 0.0, 1.0);
}
`;

  // ---------------- INTERIOR: corridor / elevator hall / garage ----------------
  const INTERIOR = COMMON + FIGURE + `
uniform vec3 u_ro;
uniform vec2 u_ang;       // yaw, pitch
uniform float u_roll;
uniform float u_focal;
uniform vec2 u_shift;
uniform float u_mode;     // 0 corridor, 1 elevator hall, 2 garage
uniform float u_old;      // 0 new & clean, 1 old & filthy
uniform float u_fog;
uniform float u_exp;
uniform float u_k0;       // index of u_lm[0]
uniform float u_lm[8];    // light levels
uniform vec3 u_lcol;
uniform float u_end;      // end window glow
uniform float u_corr;     // corruption of the door numbers
uniform float u_door;     // elevator door opening 0..1
uniform float u_figIn;    // figure stands inside the elevator car
uniform float u_led;      // elevator floor indicator
uniform vec3 u_clight;    // a light on the camera itself

const float PITCH = 3.6;
const float LPITCH = 5.5;
const float ZBACK = 16.0;
float gW, gH, gZend;

struct Hit { float t; vec3 n; vec3 p; int id; float mat; };
struct Surf { vec3 alb; float spec; float gloss; vec3 emis; float wet; };

float boxIn(vec3 ro, vec3 rd, float W, float y0, float y1, float z1, out vec3 n, out int id){
  float t = 1e5; n = vec3(0.0, 1.0, 0.0); id = -1;
  if (rd.x < -1e-6){ float h = (-W - ro.x) / rd.x; if (h < t){ t = h; n = vec3(1, 0, 0); id = 2; } }
  if (rd.x >  1e-6){ float h = ( W - ro.x) / rd.x; if (h < t){ t = h; n = vec3(-1, 0, 0); id = 3; } }
  if (rd.y < -1e-6){ float h = (y0 - ro.y) / rd.y; if (h < t){ t = h; n = vec3(0, 1, 0); id = 0; } }
  if (rd.y >  1e-6){ float h = (y1 - ro.y) / rd.y; if (h < t){ t = h; n = vec3(0, -1, 0); id = 1; } }
  if (rd.z >  1e-6){ float h = (z1 - ro.z) / rd.z; if (h < t){ t = h; n = vec3(0, 0, -1); id = 4; } }
  return t;
}
float boxOut(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax, out vec3 n){
  vec3 inv = 1.0 / (rd + vec3(equal(rd, vec3(0.0))) * 1e-6);
  vec3 t0 = (bmin - ro) * inv, t1 = (bmax - ro) * inv;
  vec3 tsm = min(t0, t1), tbg = max(t0, t1);
  float tn = max(max(tsm.x, tsm.y), tsm.z), tf = min(min(tbg.x, tbg.y), tbg.z);
  n = vec3(0.0);
  if (tn > tf || tf < 0.0) return -1.0;
  if (tn == tsm.x) n = vec3(-sign(rd.x), 0.0, 0.0); else if (tn == tsm.y) n = vec3(0.0, -sign(rd.y), 0.0); else n = vec3(0.0, 0.0, -sign(rd.z));
  return max(tn, 0.0);
}
float lightLevel(int k){ int i = k - int(u_k0); if (i < 0 || i > 7) return 0.0; return u_lm[i]; }
vec3 lightPos(int k){ return vec3(0.0, gH - 0.075, float(k) * LPITCH + 2.75); }

Hit traceScene(vec3 ro, vec3 rd){
  Hit h; vec3 n; int id; vec3 nn; float th; float m;
  h.t = boxIn(ro, rd, gW, 0.0, gH, gZend, n, id);
  h.n = n; h.id = id; h.mat = 0.0;
  vec3 hp = ro + rd * h.t;
  if (u_mode < 0.5){
    if (id == 2 || id == 3){
      float sg = id == 2 ? -1.0 : 1.0;
      int i0 = int(floor(hp.z / PITCH));
      for (int j = -1; j <= 1; j++){
        float zc = float(i0 + j) * PITCH + 1.75;
        float xa = sg * (gW - 0.075), xb = sg * (gW + 0.01);
        vec3 bmin = vec3(min(xa, xb), 0.0, zc - 0.56), bmax = vec3(max(xa, xb), 2.13, zc + 0.56);
        th = boxOut(ro, rd, bmin, vec3(bmax.x, bmax.y, zc - 0.455), nn);
        if (th > 0.0 && th < h.t){ h.t = th; h.n = nn; h.id = 5; }
        th = boxOut(ro, rd, vec3(bmin.x, 0.0, zc + 0.455), bmax, nn);
        if (th > 0.0 && th < h.t){ h.t = th; h.n = nn; h.id = 5; }
        th = boxOut(ro, rd, vec3(bmin.x, 2.055, bmin.z), bmax, nn);
        if (th > 0.0 && th < h.t){ h.t = th; h.n = nn; h.id = 5; }
      }
    }
    if (u_old > 0.5){
      for (int s = 0; s < 2; s++){
        float sg = s == 0 ? -1.0 : 1.0;
        vec3 a = vec3(sg * (gW - 0.07), 0.92, ro.z - 3.0), b = vec3(sg * (gW - 0.07), 0.92, ro.z + 60.0);
        th = raySeg(ro, rd, a, b, 0.024);
        if (th > 0.0 && th < h.t){
          vec3 q = ro + rd * th, ba = b - a;
          h.t = th; h.n = normalize(q - (a + ba * clamp(dot(q - a, ba) / dot(ba, ba), 0.0, 1.0))); h.id = 9;
        }
      }
    }
  } else if (u_mode > 1.5){
    int k0 = int(floor(hp.z / 6.2));
    for (int j = -1; j <= 1; j++){
      float zk = float(k0 + j) * 6.2 + 3.1;
      for (int s = 0; s < 2; s++){
        float x = s == 0 ? -2.2 : 2.2;
        th = boxOut(ro, rd, vec3(x - 0.32, 0.0, zk - 0.32), vec3(x + 0.32, gH, zk + 0.32), nn);
        if (th > 0.0 && th < h.t){ h.t = th; h.n = nn; h.id = 6; h.mat = x; }
      }
    }
    for (int s = 0; s < 2; s++){
      float x = s == 0 ? -1.5 : 1.5;
      vec3 a = vec3(x, gH - 0.22, ro.z - 3.0), b = vec3(x, gH - 0.22, ro.z + 60.0);
      th = raySeg(ro, rd, a, b, 0.065);
      if (th > 0.0 && th < h.t){
        vec3 q = ro + rd * th, ba = b - a;
        h.t = th; h.n = normalize(q - (a + ba * clamp(dot(q - a, ba) / dot(ba, ba), 0.0, 1.0))); h.id = 11;
      }
    }
  } else {
    if (id == 4){
      float gap = u_door * 0.82;
      if (abs(hp.x) < gap && hp.y < 2.2){
        vec3 ro2 = hp + rd * 0.002; vec3 n2; int id2;
        float t2 = boxIn(ro2, rd, 0.8, 0.02, 2.3, ZBACK + 1.6, n2, id2);
        h.t += t2; h.n = n2; h.id = 8;
      }
    }
  }
  for (int i = 0; i < 8; i++){
    if (u_lm[i] < 0.004) continue;
    vec3 lp = lightPos(int(u_k0) + i);
    th = raySeg(ro, rd, lp - vec3(0.0, 0.0, 0.6), lp + vec3(0.0, 0.0, 0.6), 0.017);
    if (th > 0.0 && th < h.t){ h.t = th; h.n = -rd; h.id = 7; h.mat = float(i); }
  }
  if (u_figOn > 0.5){
    float tf = traceFigure(ro, rd, h.t, m);
    if (tf > 0.0){
      bool ok = true;
      if (u_figIn > 0.5){
        vec3 pw = ro + rd * ((ZBACK - ro.z) / rd.z);
        if (abs(pw.x) > u_door * 0.82 || pw.y > 2.2) ok = false;
      }
      if (ok){ h.t = tf; h.id = 10; h.mat = m; }
    }
  }
  h.p = ro + rd * h.t;
  return h;
}

vec3 concrete(vec2 xz){
  float m = N1(xz * 0.028).b, m2 = N2(xz * 0.1875).g;
  vec3 c = vec3(0.40, 0.40, 0.375) * (0.75 + 0.5 * m) * (0.9 + 0.2 * m2);
  c *= 1.0 - 0.5 * smoothstep(0.64, 0.81, N1(xz * 0.011 + 0.27).a);
  return c;
}
void doorSurf(float lz, float y, out vec3 alb, out float spec, out float gloss){
  vec2 duv = vec2((lz - 1.75) / 0.91 + 0.5, y / 2.055);
  float grain = N1(vec2(duv.x * 0.28, duv.y * 0.0375)).r;
  alb = mix(vec3(0.40, 0.25, 0.15), vec3(0.25, 0.12, 0.08), u_old) * (0.8 + 0.4 * grain);
  spec = 0.16; gloss = 30.0;
  float pl = 0.0;
  pl = max(pl, 1.0 - step(0.012, abs(abs(duv.x - 0.5) - 0.365)));
  pl = max(pl, 1.0 - step(0.012, abs(duv.y - 0.10)));
  pl = max(pl, 1.0 - step(0.012, abs(duv.y - 0.44)));
  pl = max(pl, 1.0 - step(0.012, abs(duv.y - 0.52)));
  pl = max(pl, 1.0 - step(0.012, abs(duv.y - 0.90)));
  alb *= 1.0 - 0.45 * pl;
  float peel = smoothstep(0.74, 0.755, N2(duv * 0.1875 + 0.12).r);
  alb = mix(alb, vec3(0.40, 0.35, 0.27), peel * u_old * 0.6);
  if (rectMask(duv, vec2(0.9, 0.47), vec2(0.028, 0.045)) > 0.5){ alb = vec3(0.62, 0.52, 0.28); spec = 0.8; gloss = 200.0; }
}

Surf shadeHit(Hit h, vec3 rd){
  Surf s; s.alb = vec3(0.5); s.spec = 0.0; s.gloss = 20.0; s.emis = vec3(0.0); s.wet = 0.0;
  vec3 p = h.p;
  float detail = 1.0 - smoothstep(4.0, 13.0, h.t);
  if (h.id == 0){
    if (u_mode > 1.5){
      s.alb = concrete(p.xz); s.spec = 0.05; s.gloss = 30.0;
      float lane = (1.0 - smoothstep(0.04, 0.07, abs(abs(p.x) - 2.95) - 0.04)) * step(N2(p.xz * 0.094).b, 0.875);
      s.alb = mix(s.alb, vec3(0.62, 0.50, 0.14), lane * 0.85);
    } else {
      float chip = N3(p.xz * 0.2).r, chip2 = N3(p.xz * 0.2 + 0.37).g;
      vec3 base = mix(vec3(0.70, 0.665, 0.61), vec3(0.56, 0.535, 0.48), u_old);
      vec3 fine = base * (0.80 + 0.40 * chip) + step(0.9, chip2) * 0.20 - step(0.93, 1.0 - chip2) * 0.26;
      vec2 g = abs(fract(p.xz / 0.6) - 0.5);
      fine = mix(fine, vec3(0.32, 0.31, 0.29), smoothstep(0.487, 0.5, max(g.x, g.y)) * 0.85);
      s.alb = mix(base, fine, detail);
      float edge = smoothstep(0.5, 1.0, abs(p.x) / gW);
      float dirt = clamp(N1(p.xz * 0.035).b * 0.66 + edge * 0.7 - 0.25, 0.0, 1.0);
      s.alb *= 1.0 - u_old * 0.75 * dirt;
      s.wet = smoothstep(0.49, 0.64, N1(p.xz * 0.022 + 0.31).a) * u_old;
      s.alb *= 1.0 - 0.45 * s.wet;
      s.spec = mix(0.06, 0.16, u_old); s.gloss = mix(140.0, 90.0, u_old);
    }
  } else if (h.id == 1){
    if (u_mode > 1.5){ s.alb = concrete(p.xz * 0.7) * 0.9; }
    else {
      float st = N1(p.xz * 0.019 + 0.117).g;
      s.alb = mix(vec3(0.88, 0.87, 0.83), vec3(0.72, 0.70, 0.60), u_old);
      s.alb = mix(s.alb, s.alb * vec3(0.72, 0.55, 0.32), smoothstep(0.555, 0.907, st) * u_old);
    }
    int kn = int(floor((p.z - 2.75) / LPITCH));
    for (int j = -1; j <= 1; j++){
      float lv = lightLevel(kn + j);
      if (lv < 0.003) continue;
      float dx = abs(p.x), dz = max(abs(p.z - lightPos(kn + j).z) - 0.6, 0.0);
      s.emis += u_lcol * lv * 0.30 * exp(-(dx * dx + dz * dz) * 12.0);
    }
  } else if (h.id == 2 || h.id == 3){
    if (u_mode > 1.5){ s.alb = concrete(vec2(p.z, p.y) * 0.8); s.spec = 0.04; }
    else {
      float dado = 1.15;
      vec3 upc = mix(vec3(0.91, 0.895, 0.855), vec3(0.70, 0.66, 0.50), u_old);
      vec3 loc = mix(vec3(0.50, 0.53, 0.52), vec3(0.075, 0.17, 0.12), u_old);
      float streak = N1(vec2(p.z * 0.078, p.y * 0.0094)).g;
      float blotch = N1(vec2(p.z * 0.028 + 0.2, p.y * 0.047)).b;
      upc *= 1.0 - u_old * (0.32 * streak + 0.27 * smoothstep(0.53, 0.85, blotch));
      upc = mix(upc, upc * vec3(0.82, 0.70, 0.52), u_old * smoothstep(0.59, 0.91, blotch));
      float peel = smoothstep(0.70, 0.72, N2(vec2(p.z, p.y) * 0.125 + 0.35).r);
      upc = mix(upc, vec3(0.52, 0.48, 0.40), peel * u_old);
      loc *= 0.8 + 0.4 * N1(vec2(p.z * 0.053, p.y * 0.28)).r;
      loc *= 1.0 - u_old * 0.55 * smoothstep(0.4, 0.0, p.y);
      s.alb = p.y < dado ? loc : upc;
      s.alb = mix(s.alb, s.alb * 0.3, (1.0 - smoothstep(0.0, 0.01, abs(p.y - dado))) * u_old);
      s.spec = p.y < dado ? 0.30 : 0.03; s.gloss = p.y < dado ? 50.0 : 10.0;
      if (u_mode < 0.5){
        float side = h.id == 2 ? -1.0 : 1.0;
        float slotf = p.z / PITCH;
        int slot = int(floor(slotf));
        float lz = fract(slotf) * PITCH;
        if (abs(lz - 1.75) < 0.455 && p.y < 2.055){
          doorSurf(lz, p.y, s.alb, s.spec, s.gloss);
        } else {
          vec3 pc = vec3(side * gW, 1.67, float(slot) * PITCH + 1.02);
          vec2 puv = faceUV(p, pc, h.n, vec2(0.26, 0.14));
          if (puv.x > 0.0 && puv.x < 1.0 && puv.y > 0.0 && puv.y < 1.0){
            int num = max((side < 0.0 ? 1 : 2) + 2 * slot, 0);
            if (u_corr > 0.5) num = 1;
            int d0 = 1, d1 = 3, d2 = num / 10, d3 = num - (num / 10) * 10;
            if (u_corr > 0.9){ d0 = 0; d1 = 0; d2 = 0; d3 = 0; }
            int di = int(puv.x * 4.0);
            int dig = di == 0 ? d0 : di == 1 ? d1 : di == 2 ? d2 : d3;
            float gm = glyph(dig, vec2(fract(puv.x * 4.0), puv.y)) * smoothstep(0.06, 0.30, dot(h.n, -rd)) * detail;
            s.alb = mix(vec3(0.80, 0.79, 0.74), vec3(0.08, 0.09, 0.14), gm);
            s.spec = 0.4; s.gloss = 120.0;
          }
        }
      }
    }
  } else if (h.id == 4){
    if (u_mode > 1.5){ s.alb = concrete(vec2(p.x, p.y) * 0.8) * 0.6; }
    else if (u_mode > 0.5){
      if (rectMask(vec2(p.x, p.y), vec2(0.0, 1.1), vec2(1.0, 1.1)) > 0.5){
        s.alb = vec3(0.55, 0.56, 0.57) * (0.90 + 0.10 * N2(vec2(p.x * 4.375, p.y * 0.0625)).r);
        s.spec = 0.9; s.gloss = 240.0;
        if (abs(p.x) < 0.012) s.alb = vec3(0.02);
      } else {
        s.alb = vec3(0.80, 0.78, 0.72); s.spec = 0.15; s.gloss = 40.0;
        if (abs(p.x) < 1.08 && abs(p.x) > 1.0 && p.y < 2.2){ s.alb = vec3(0.20, 0.20, 0.21); s.spec = 0.6; s.gloss = 150.0; }
      }
      vec2 luv = faceUV(p, vec3(0.0, 2.47, ZBACK), h.n, vec2(0.5, 0.22));
      if (luv.x > 0.0 && luv.x < 1.0 && luv.y > 0.0 && luv.y < 1.0){
        s.alb = vec3(0.01);
        int num = int(u_led + 0.5);
        int dig = luv.x < 0.5 ? num / 10 : num - (num / 10) * 10;
        s.emis = vec3(1.0, 0.22, 0.08) * 2.6 * glyph(dig, vec2(fract(luv.x * 2.0), luv.y));
      }
    } else {
      float win = rectMask(vec2(p.x, p.y), vec2(0.0, 1.6), vec2(0.62, 0.68));
      float bars = max(1.0 - smoothstep(0.0, 0.02, abs(p.x)), 1.0 - smoothstep(0.0, 0.02, abs(p.y - 1.6)));
      bars = max(bars, 1.0 - smoothstep(0.0, 0.025, abs(abs(p.x) - 0.62) - 0.03));
      bars = max(bars, 1.0 - smoothstep(0.0, 0.025, abs(abs(p.y - 1.6) - 0.68) - 0.03));
      if (win > 0.5 && bars < 0.5){
        s.alb = vec3(0.0);
        s.emis = mix(vec3(1.0, 0.95, 0.86) * 2.0, vec3(0.40, 0.50, 0.55), u_old) * u_end * (0.55 + 0.45 * N2(vec2(p.x, p.y) * 0.28).g);
      } else if (bars > 0.5){ s.alb = vec3(0.12, 0.11, 0.10); s.spec = 0.2; }
      else {
        s.alb = mix(vec3(0.91, 0.895, 0.855), vec3(0.70, 0.66, 0.50), u_old) * 0.9;
        s.alb *= 1.0 - u_old * 0.4 * N2(vec2(p.x, p.y) * 0.094).b;
      }
    }
  } else if (h.id == 5){
    s.alb = mix(vec3(0.82, 0.80, 0.74), vec3(0.60, 0.56, 0.47), u_old);
    float chip = smoothstep(0.67, 0.69, N2(vec2(p.z, p.y) * 0.4375).b);
    s.alb = mix(s.alb, vec3(0.30, 0.22, 0.14), chip * u_old * 0.8);
    s.spec = 0.1; s.gloss = 24.0;
  } else if (h.id == 6){
    s.alb = concrete(vec2(p.x, p.y) * 0.8 + p.z * 0.3);
    if (abs(h.n.x) > 0.5 || abs(h.n.z) > 0.5){
      float zk = (floor((p.z - 3.1) / 6.2) + 0.5) * 6.2;
      vec2 duv = faceUV(p, vec3(h.mat, 1.30, zk), h.n, vec2(0.46, 0.80));
      if (duv.x > 0.0 && duv.x < 1.0 && duv.y > 0.0 && duv.y < 1.0){
        s.alb = mix(s.alb, vec3(0.62, 0.50, 0.14) * (0.6 + 0.4 * N3(vec2(p.z, p.y) * 0.625).g), glyph(2, duv));
      }
    }
  } else if (h.id == 7){
    s.alb = vec3(0.0);
    s.emis = u_lcol * lightLevel(int(u_k0) + int(h.mat + 0.5)) * 11.0;
  } else if (h.id == 8){
    s.alb = vec3(0.42, 0.42, 0.44); s.spec = 0.5; s.gloss = 120.0;
    if (h.n.y > 0.5){ s.alb = vec3(0.12); s.spec = 0.1; }
  } else if (h.id == 9){
    s.alb = vec3(0.30, 0.17, 0.10) * (0.8 + 0.4 * N1(vec2(p.z * 0.094, p.y * 1.25)).b);
    s.spec = 0.3; s.gloss = 60.0;
  } else if (h.id == 10){
    if (h.mat < 0.5){ s.alb = vec3(0.040, 0.038, 0.036) * (0.6 + 0.8 * N1(vec2(p.x * 0.9 + p.z * 0.6, p.y * 0.85 + p.z * 0.3)).g); s.spec = 0.04; s.gloss = 16.0; }
    else if (h.mat < 1.5){ s.alb = skinAlbedo(p); s.spec = 0.5; s.gloss = 36.0; }
    else { s.alb = vec3(0.0); s.emis = vec3(0.80, 0.88, 0.76) * u_eyes * 2.6 * eyeGlow(p, u_ro); }
  } else if (h.id == 11){
    s.alb = vec3(0.30, 0.30, 0.31); s.spec = 0.3; s.gloss = 80.0;
    s.alb *= 1.0 - 0.5 * step(0.85, fract(p.z / 2.0));
  }
  return s;
}

bool g_self = false;   // shading the figure's own surface: it must not shadow itself
float figShadow(vec3 ro, vec3 rd, float maxd){
  if (u_figOn < 0.5 || g_self) return 1.0;
  // the figure as a soft dark column: its shadow is simply how closely the light ray passes its axis
  float d = segSegDist(ro, ro + rd * maxd, vec3(u_fig.x, 0.0, u_fig.y), vec3(u_fig.x, 1.9, u_fig.y));
  return smoothstep(0.13, 0.52, d);
}
vec3 ambTerm(){ return mix(vec3(0.045, 0.045, 0.043), vec3(0.006, 0.007, 0.0075), u_old); }
// crude indirect bounce: fills shadows only where the tubes are actually on
float bounce(vec3 p){
  float b = 0.0;
  int kn = int(floor((p.z - 2.75) / LPITCH));
  for (int j = -1; j <= 1; j++){
    float lv = lightLevel(kn + j);
    if (lv < 0.003) continue;
    vec3 ld = lightPos(kn + j) - p;
    b += lv / (1.0 + dot(ld, ld) * 0.35);
  }
  return b;
}
vec3 lighting(vec3 p, vec3 n, vec3 alb, float spec, float gloss, vec3 rd){
  vec3 col = vec3(0.0);
  int kn = int(floor((p.z - 2.75) / LPITCH));
  for (int j = -2; j <= 2; j++){
    int k = kn + j;
    float lv = lightLevel(k);
    if (lv < 0.003) continue;
    vec3 base = lightPos(k);
    float sh = -1.0;
    for (int q = -1; q <= 1; q += 2){
      vec3 lp = base + vec3(0.0, 0.0, 0.4 * float(q));
      vec3 ld = lp - p; float d = length(ld); ld /= d;
      float ndl = max(dot(n, ld), 0.0);
      if (ndl <= 0.0) continue;
      if (sh < 0.0) sh = figShadow(p + n * 0.012, ld, d);
      float att = 1.0 / (1.0 + d * d * 0.24);
      vec3 hv = normalize(ld - rd);
      float sp = pow(max(dot(n, hv), 0.0), gloss) * spec * (gloss + 8.0) * 0.04;
      col += u_lcol * (lv * att * ndl * sh) * (alb + sp);
    }
  }
  if (u_clight.x + u_clight.y + u_clight.z > 0.0){
    vec3 ld = u_ro - p; float d = length(ld); ld /= d;
    float ndl = max(dot(n, ld), 0.0);
    if (ndl > 0.0) col += u_clight * alb * ndl * 2.0 / (1.0 + d * d * 1.2);
  }
  return col;
}
vec3 cheapLight(vec3 p, vec3 n){
  vec3 c = ambTerm() + u_lcol * bounce(p) * 0.075;
  int kn = int(floor((p.z - 2.75) / LPITCH));
  for (int j = -1; j <= 1; j++){
    int k = kn + j; float lv = lightLevel(k); if (lv < 0.003) continue;
    vec3 ld = lightPos(k) - p; float d = length(ld); ld /= d;
    c += u_lcol * lv * max(dot(n, ld), 0.0) / (1.0 + d * d * 0.24);
  }
  return c;
}

void main(){
  if (u_mode > 1.5){ gW = 4.6; gH = 2.45; gZend = u_ro.z + 60.0; }
  else if (u_mode > 0.5){ gW = 1.25; gH = 2.6; gZend = ZBACK; }
  else { gW = 1.05; gH = 2.62; gZend = u_ro.z + 44.0; }
  vec2 uv = (2.0 * gl_FragCoord.xy - u_res) / u_res.y + u_shift;
  float cy = cos(u_ang.x), sy = sin(u_ang.x), cp = cos(u_ang.y), sp = sin(u_ang.y);
  vec3 fwd = vec3(sy * cp, sp, cy * cp);
  vec3 right = vec3(cy, 0.0, -sy);
  vec3 up = cross(fwd, right);
  vec2 o = rot(u_roll) * uv;
  vec3 rd = normalize(fwd * u_focal + right * o.x + up * o.y);
  vec3 ro = u_ro;

  Hit h = traceScene(ro, rd);
  Surf s = shadeHit(h, rd);
  vec3 n = h.n;
  float ao = 1.0;
  if (h.id == 10){
    n = figureNormal(h.p);
    ao = figAO(h.p, n);
    // cloth folds and skin pores
    vec2 buv = vec2(h.p.x + h.p.z * 0.7, h.p.y * 0.9 + h.p.z * 0.3);
    if (h.mat < 0.5) n = bumpNormal(n, h.p, N2(buv * 0.4375).g, 0.03);
    else if (h.mat < 1.5) n = bumpNormal(n, h.p, N3(buv * 0.65).b, 0.0025);
  }
  g_self = h.id == 10;
  vec3 col = lighting(h.p, n, s.alb, s.spec, s.gloss, rd) * ao;
  col += s.alb * (ambTerm() + u_lcol * bounce(h.p) * 0.075) * ao;
  col += s.emis;

  // wet-floor reflection
  if (h.id == 0){
    vec3 rn = normalize(vec3((N2(h.p.xz * 0.28).r - 0.5) * 0.10 * u_old, 1.0, (N2(h.p.xz * 0.28 + 0.3).g - 0.5) * 0.10 * u_old));
    vec3 rr = reflect(rd, rn);
    if (rr.y > 0.02){
      vec3 ro2 = h.p + vec3(0.0, 0.002, 0.0); vec3 n2; int id2; float m;
      float t2 = boxIn(ro2, rr, gW, 0.0, gH, gZend, n2, id2);
      vec3 pr = ro2 + rr * t2;
      vec3 a2 = vec3(0.5);
      if (id2 == 0) a2 = vec3(0.01);
      else if (id2 == 1) a2 = vec3(0.5);
      else if (id2 == 2 || id2 == 3) a2 = mix(vec3(0.7), vec3(0.15), step(pr.y, 1.15) * u_old);
      else if (id2 == 4) a2 = mix(vec3(0.7), vec3(0.2), u_old);
      vec3 rc = a2 * cheapLight(pr, n2);
      for (int i = 0; i < 8; i++){
        if (u_lm[i] < 0.004) continue;
        vec3 lp = lightPos(int(u_k0) + i);
        float th = raySeg(ro2, rr, lp - vec3(0.0, 0.0, 0.6), lp + vec3(0.0, 0.0, 0.6), 0.07);
        if (th > 0.0 && th < t2) rc += u_lcol * u_lm[i] * 1.6;
      }
      float tf = traceFigure(ro2, rr, t2, m);
      if (u_figOn > 0.5 && tf > 0.0) rc = (m > 0.5 && m < 1.5) ? vec3(0.22) : vec3(0.004);
      if (id2 == 4 && u_mode < 0.5 && abs(pr.x) < 0.62 && abs(pr.y - 1.6) < 0.68) rc += mix(vec3(1.0, 0.95, 0.86) * 2.0, vec3(0.40, 0.50, 0.55), u_old) * u_end;
      float fres = 0.03 + 0.97 * pow(1.0 - max(dot(-rd, h.n), 0.0), 4.0);
      col += rc * fres * mix(mix(0.2, 0.5, u_old), 1.15, s.wet) * exp(-t2 * u_fog * 1.6);
    }
  }

  // lit haze
  float dens = u_fog;
  float T = exp(-h.t * dens * 1.6);
  vec3 scat = vec3(0.0);
  float tmax = min(h.t, 34.0), dt = tmax / 6.0;
  float tt = dt * (0.2 + 0.6 * hash21(gl_FragCoord.xy));
  for (int i = 0; i < 6; i++){
    vec3 sp = ro + rd * tt;
    int kn = int(floor((sp.z - 2.75) / LPITCH));
    for (int j = -1; j <= 1; j++){
      int k = kn + j; float lv = lightLevel(k); if (lv < 0.002) continue;
      vec3 ld = lightPos(k) - sp; float d2 = dot(ld, ld);
      float mu = dot(rd, ld * inversesqrt(d2));
      float ph = 0.0796 / pow(1.17 - 0.8 * mu, 1.5);
      scat += u_lcol * lv * ph / (0.6 + d2 * 0.5);
    }
    tt += dt;
    if (tt > tmax) break;
  }
  scat *= dens * dt * 5.0 * T;
  col = col * T + scat;
  col = 1.0 - exp(-col * u_exp);
  fragColor = vec4(col, 1.0);
}
`;

  // ---------------- EXTERIOR: the towers by the pool ----------------
  const EXTERIOR = COMMON + FIGURE + `
uniform vec3 u_ta;
uniform float u_focal;
uniform vec2 u_shift;
uniform float u_night;     // 0 day .. 1 night (dusk in between)
uniform float u_camT;      // 0 hero view .. 1 in front of the lit window, >1 pushing in
uniform float u_one;       // the single lit window
uniform float u_winFig;    // figure standing in it
uniform float u_fog;
uniform float u_exp;
uniform float u_lamp;
uniform float u_ir;        // infra-red illuminator on the camera itself
uniform vec3 u_ro0;         // hero camera position / target (the gate camera reuses them)
uniform vec3 u_ta0;

const vec3 SUN = vec3(0.54127, 0.23619, 0.80698);   // normalize(0.55, 0.24, 0.82): low evening sun
// two rows of trees flanking the pool, one cell repeated every 8 m with a hashed size (x, z, radius, height)
vec4 treeAt(float row, float z){
  float idx = floor((z - 2.0) / 8.0);
  return vec4(row < 0.5 ? -11.0 : 30.5, 6.0 + 8.0 * idx, 1.4 + 0.7 * hash11(idx * 7.3 + row * 31.0), 3.0 + 0.8 * hash11(idx * 3.1 + row * 17.0 + 5.0));
}
const float BAY = 2.5;
const vec3 WIN_C = vec3(16.25, 40.5, 8.75);      // 7号楼 13层 1301
// path lamps along the far edge of the pool
vec3 lampPos(int i){ return vec3(-2.0 + 5.0 * float(i), 0.75, 17.0); }

// waffle facade: glass core with protruding spandrel bands and vertical fins
vec2 facade(vec3 p, vec3 c, vec3 hf, float fh, float bandF, float depth){
  vec3 q = p - c, aq = abs(q);
  vec3 b = aq - (hf + depth);
  float db = length(max(b, 0.0)) + min(max(b.x, max(b.y, b.z)), 0.0);
  if (db > 0.5) return vec2(db, 1.0);
  float best = sdBox(q, hf), id = 0.0, d;
  float y0 = c.y - hf.y, bh = bandF * fh * 0.5;
  d = sdBox(vec3(aq.x - hf.x - depth * 0.5 + 0.01, mod(q.y - y0, fh) - bh, q.z), vec3(depth * 0.5 + 0.01, bh, hf.z - 0.02));
  d = max(d, abs(q.y) - hf.y + 0.01);
  if (d < best){ best = d; id = 1.0; }
  d = sdBox(vec3(q.x, mod(q.y - y0, fh) - bh, aq.z - hf.z - depth * 0.5 + 0.01), vec3(hf.x - 0.02, bh, depth * 0.5 + 0.01));
  d = max(d, abs(q.y) - hf.y + 0.01);
  if (d < best){ best = d; id = 1.0; }
  d = sdBox(vec3(aq.x - hf.x - depth * 0.5 + 0.01, q.y, mod(q.z - c.z + BAY * 0.5, BAY) - BAY * 0.5), vec3(depth * 0.5 + 0.01, hf.y, 0.065));
  if (d < best){ best = d; id = 1.0; }
  d = sdBox(vec3(mod(q.x - c.x + BAY * 0.5, BAY) - BAY * 0.5, q.y, aq.z - hf.z - depth * 0.5 + 0.01), vec3(0.065, hf.y, depth * 0.5 + 0.01));
  if (d < best){ best = d; id = 1.0; }
  return vec2(best, id);
}
vec2 map(vec3 p){
  vec2 r = facade(p, vec3(14.0, 36.0, 0.0), vec3(10.0, 36.0, 8.75), 3.0, 0.30, 0.38);
  float pd = sdBox(p - vec3(14.0, 5.0, 0.0), vec3(12.6, 5.0, 11.1));
  if (pd < r.x) r = vec2(pd, 1.0);
  float clip = max(2.0 - p.z, p.z - 42.0);
  for (int row = 0; row < 2; row++){
    vec4 t = treeAt(float(row), p.z);
    vec3 lp = p - vec3(t.x, 0.0, t.y);
    float ds = max(length(lp - vec3(0.0, t.w, 0.0)) - t.z, clip);
    float tr = max(sdCapsule(lp, vec3(0.0), vec3(0.0, t.w, 0.0), 0.14), clip);
    if (ds < r.x) r = vec2(ds, 2.0);
    if (tr < r.x) r = vec2(tr, 3.0);
  }
  // only the two path lamps the point can lie between
  float li = clamp(floor((p.x + 2.0) / 5.0), 0.0, 5.0);
  for (int k = 0; k < 2; k++){
    vec3 lp = lampPos(int(li) + k);
    float db = sdCapsule(p, vec3(lp.x, 0.0, lp.z), vec3(lp.x, 0.9, lp.z), 0.06);
    if (db < r.x) r = vec2(db, 5.0);
  }
  return r;
}
// Seen only by the gate camera, at a distance, through heavy noise: the same silhouette, stripped to its bones.
float sdFigureLite(vec3 p){
  p -= vec3(u_fig.x, 0.0, u_fig.y);
  if (abs(u_figYaw) > 0.001) p.xz = rot(u_figYaw) * p.xz;
  float d = sdCapsule(p, vec3(0.0, 0.98, 0.0), vec3(0.0, 1.56, 0.035), 0.15);
  d = min(d, sdCapsule(p, vec3(0.1, -0.02, 0.0), vec3(0.1, 1.0, 0.0), 0.068));
  d = min(d, sdCapsule(p, vec3(-0.1, -0.02, 0.0), vec3(-0.1, 1.0, 0.0), 0.068));
  d = min(d, sdCapsule(p, vec3(0.21, 1.55, 0.03), vec3(0.235, 0.5, -0.015), 0.042));
  d = min(d, sdCapsule(p, vec3(-0.21, 1.55, 0.03), vec3(-0.235, 0.5, -0.02), 0.042));
  d = min(d, sdCapsule(p, vec3(0.0, 1.56, 0.035), vec3(0.0, 1.7, 0.025), 0.042));
  vec3 hp = p - vec3(0.0, 1.815, 0.02);
  hp.xy = rot(u_figPose.x) * hp.xy;
  return min(d, (length(hp / vec3(0.090, 0.146, 0.104)) - 1.0) * 0.085);
}
vec3 liteLocal(vec3 p){
  p -= vec3(u_fig.x, 0.0, u_fig.y);
  if (abs(u_figYaw) > 0.001) p.xz = rot(u_figYaw) * p.xz;
  vec3 hp = p - vec3(0.0, 1.815, 0.02);
  hp.xy = rot(u_figPose.x) * hp.xy;
  return hp;
}
float traceLite(vec3 ro, vec3 rd, float tmax){
  if (tmax < 0.0) tmax = 60.0;
  vec3 oc = ro - vec3(u_fig.x, 1.0, u_fig.y);
  float b = dot(oc, rd), c = dot(oc, oc) - 1.3, h = b * b - c;
  if (h < 0.0) return -1.0;
  h = sqrt(h);
  float t = max(-b - h, 0.0), tl = min(tmax, -b + h);
  for (int i = 0; i < 48; i++){
    float d = sdFigureLite(ro + rd * t);
    if (d < 0.004 * (1.0 + t * 0.1)) return t;
    t += d * 0.9;
    if (t > tl) break;
  }
  return -1.0;
}
vec3 liteNormal(vec3 p){
  const vec2 e = vec2(0.004, -0.004);
  return normalize(e.xyy * sdFigureLite(p + e.xyy) + e.yyx * sdFigureLite(p + e.yyx) + e.yxy * sdFigureLite(p + e.yxy) + e.xxx * sdFigureLite(p + e.xxx));
}
// dark cloth, pale skin, two fixed points of light where the eyes are
vec3 liteAlbedo(vec3 p, out vec3 emis){
  emis = vec3(0.0);
  if (length(p.xz - u_fig) > 0.16 || p.y < 1.66) return vec3(0.040, 0.038, 0.036);
  vec3 hp = liteLocal(p);
  if (length(hp - vec3(0.038, 0.020, -0.090)) < 0.012 || length(hp - vec3(-0.038, 0.016, -0.090)) < 0.012){ emis = vec3(0.80, 0.88, 0.76) * u_eyes * 2.0; return vec3(0.0); }
  if (length(hp - vec3(0.004, -0.070, -0.086)) < 0.030) return vec3(0.0);
  return vec3(0.56, 0.525, 0.495);
}
vec3 skyColor(vec3 rd);
// what the pool mirrors: the sky, the dark mass of the towers, the one lit window. No second scene trace.
float boxT(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax){
  vec3 inv = 1.0 / rd, t0 = (bmin - ro) * inv, t1 = (bmax - ro) * inv;
  vec3 lo = min(t0, t1), hi = max(t0, t1);
  float tn = max(max(lo.x, lo.y), lo.z), tf = min(min(hi.x, hi.y), hi.z);
  return (tf > max(tn, 0.0)) ? max(tn, 0.0) : -1.0;
}
vec3 mirror(vec3 ro, vec3 rr){
  vec3 rc = skyColor(rr);
  float ta = boxT(ro, rr, vec3(4.0, 0.0, -8.75), vec3(24.0, 72.0, 8.75));
  float tp = boxT(ro, rr, vec3(1.5, 0.0, -11.0), vec3(26.5, 10.0, 11.0));
  float t = min(ta, tp);
  if (t > 0.0){
    float night = smoothstep(0.5, 1.0, u_night);
    vec3 mass = vec3(0.10, 0.10, 0.11) * (vec3(0.9, 0.75, 0.55) * (1.0 - night) + night * 0.12);
    rc = mix(mass, rc, 1.0 - exp(-t * u_fog * 2.5));
  }
  // the lit window of 1301, doubled in the water
  if (rr.z < -0.001 && ta > 0.0){
    vec3 pw = ro + rr * ((8.75 - ro.z) / rr.z);
    if (pw.x > 15.0 && pw.x < 17.5 && pw.y > 39.0 && pw.y < 42.0 && ro.z > 8.75) rc = vec3(1.0, 0.72, 0.40) * u_one * (1.0 - u_winFig * 0.9);
  }
  return rc;
}
vec3 calcNormal(vec3 p){
  vec2 e = vec2(0.003, 0.0);
  return normalize(vec3(map(p + e.xyy).x - map(p - e.xyy).x, map(p + e.yxy).x - map(p - e.yxy).x, map(p + e.yyx).x - map(p - e.yyx).x));
}
float softShadow(vec3 ro, vec3 rd, float maxt){
  float res = 1.0, t = 0.03;
  for (int i = 0; i < 26; i++){
    float h = map(ro + rd * t).x;
    res = min(res, 10.0 * h / t);
    t += clamp(h, 0.04, 1.4);
    if (res < 0.012 || t > maxt) break;
  }
  return clamp(res, 0.0, 1.0);
}
float calcAO(vec3 p, vec3 n){
  float occ = 0.0, sca = 1.0;
  for (int i = 1; i <= 4; i++){
    float h = 0.03 + 0.22 * float(i);
    occ += (h - map(p + n * h).x) * sca; sca *= 0.72;
  }
  return clamp(1.0 - 1.5 * occ, 0.0, 1.0);
}
vec3 skyColor(vec3 rd){
  float dusk = smoothstep(0.0, 0.55, u_night), night = smoothstep(0.5, 1.0, u_night);
  vec3 zen = mix(mix(vec3(0.30, 0.53, 0.90), vec3(0.13, 0.16, 0.33), dusk), vec3(0.020, 0.024, 0.040), night);
  vec3 hor = mix(mix(vec3(1.00, 0.88, 0.70), vec3(0.98, 0.50, 0.26), dusk), vec3(0.070, 0.078, 0.095), night);
  vec3 col = mix(hor, zen, pow(clamp(rd.y, 0.0, 1.0), 0.45));
  float sd = max(dot(rd, SUN), 0.0);
  col += mix(vec3(1.0, 0.78, 0.50), vec3(1.0, 0.42, 0.14), dusk) * (pow(sd, 6.0) * 0.30 + pow(sd, 64.0) * 0.8 + pow(sd, 2500.0) * 9.0) * (1.0 - night);
  vec2 cuv = rd.xz / (rd.y + 0.14) * 1.3 + vec2(u_time * 0.004, 0.0);
  float cl = smoothstep(0.61, 0.94, N1(cuv * 0.0375).r);
  vec3 cc = mix(mix(vec3(1.0, 0.94, 0.86), vec3(0.98, 0.60, 0.38), dusk), vec3(0.034, 0.040, 0.052), night);
  col = mix(col, cc, cl * smoothstep(0.0, 0.12, rd.y) * mix(0.42, 0.3, night));
  return col;
}
float trace(vec3 ro, vec3 rd, out float id){
  float t = 0.0, tg = 1e5; id = -1.0; vec2 r = vec2(1e5);
  if (rd.y < -1e-5) tg = -ro.y / rd.y;
  for (int i = 0; i < 120; i++){
    r = map(ro + rd * t);
    if (r.x < 0.0015 * (1.0 + t * 0.08)){ id = r.y; break; }
    t += r.x * 0.9;
    if (t > tg){ t = tg; id = 4.0; break; }
    if (t > 240.0) break;
  }
  if (id < 0.0 && r.x < 0.02) id = r.y;
  // rays that ran out of steps skimming the ground still end on the ground, deep in the haze
  if (id < 0.0 && tg < 1e4){ id = 4.0; t = tg; }
  return id < 0.0 ? -1.0 : t;
}
float lampFlick(int i){ return i == 3 ? (0.55 + 0.45 * step(0.5, hash11(floor(u_time * 17.0)))) : 1.0; }
vec3 g_cam;
vec3 shade(vec3 p, vec3 n, vec3 rd, float id, float full){
  float dusk = smoothstep(0.0, 0.55, u_night), night = smoothstep(0.5, 1.0, u_night);
  vec3 sunCol = mix(vec3(1.75, 1.36, 0.98), vec3(1.15, 0.50, 0.22), dusk) * (1.0 - night);
  vec3 alb = vec3(0.5), emis = vec3(0.0);
  float spec = 0.0, gloss = 30.0, up = 0.0;
  bool podium = p.y < 10.0 && abs(p.x - 14.0) < 12.6 && abs(p.z) < 11.1;
  if (id < 0.5){ // glass
    bool zf = abs(n.z) > 0.5;
    float u = zf ? p.x : (abs(n.x) > 0.5 ? p.z : p.x);
    float bu = floor(u / BAY);
    float faceId = zf ? (n.z > 0.0 ? 0.0 : 1.0) : (n.x > 0.0 ? 2.0 : 3.0);
    float fh = podium ? 5.0 : 3.0;
    float fv = floor(p.y / fh);
    float hsh = hash21(vec2(bu * 1.7 + faceId * 31.0, fv * 2.3 + faceId * 7.0));
    float hsh2 = hash21(vec2(fv * 5.1 + faceId, bu * 3.7));
    vec3 refl = skyColor(reflect(rd, n));
    float ndv = max(dot(-rd, n), 0.0);
    vec3 g = mix(vec3(0.012, 0.015, 0.020), refl, (0.30 + 0.55 * pow(1.0 - ndv, 3.0)) * (1.0 - night * 0.85));
    g = mix(g, vec3(0.30, 0.29, 0.27) * (1.0 - night * 0.9), step(0.84, hsh2) * 0.5);
    alb = g;
    bool specCell = (faceId == 0.0 && abs(bu - 6.0) < 0.5 && abs(p.y - 40.5) < 1.5 && p.z > 8.0 && p.y > 30.0);
    float litFrac = 0.62 * sin(3.14159 * clamp((u_night - 0.22) / 0.62, 0.0, 1.0));
    float lit = specCell ? 0.0 : step(hsh, litFrac);
    vec3 wc = mix(vec3(1.0, 0.70, 0.40), vec3(0.86, 0.92, 1.0), step(0.78, hsh2)) * (0.55 + 0.9 * hsh);
    emis += lit * wc * 1.5;
    // lobby: lit at dusk, dead by midnight
    if (podium) emis += vec3(1.0, 0.82, 0.58) * smoothstep(0.15, 0.4, u_night) * (1.0 - smoothstep(0.62, 0.9, u_night)) * 0.5;
    if (specCell){
      // 1301: one window, and somebody standing in it
      vec2 m = vec2(fract(u / BAY) * (BAY / 3.0), (p.y - 39.0) / 3.0);
      vec2 c = vec2(0.5 * (BAY / 3.0), 0.0);
      float hd = length(m - c - vec2(0.0, 0.535)) - 0.036;
      float bd = sdCapsule(vec3(m - c, 0.0), vec3(0.0, 0.0, 0.0), vec3(0.0, 0.475, 0.0), 0.072);
      float nk = sdCapsule(vec3(m - c, 0.0), vec3(0.0, 0.48, 0.0), vec3(0.0, 0.52, 0.0), 0.022);
      float sil = min(min(hd, bd), nk);
      float aa = fwidth(sil) * 1.2 + 0.002;
      emis = vec3(1.0, 0.72, 0.40) * u_one * (1.6 + 0.5 * N2(vec2(u_time * 0.094, 0.31)).r)
           * (1.0 - (1.0 - smoothstep(-aa, aa, sil)) * u_winFig);
    }
  } else if (id < 1.5){ // stone
    alb = vec3(0.80, 0.74, 0.64);
    float ju = abs(mod(abs(n.z) > 0.5 ? p.x : p.z, 1.25) - 0.625);
    alb *= 1.0 - 0.10 * (1.0 - smoothstep(0.004, 0.012, ju - 0.004));
    alb *= 0.96 + 0.08 * N2(vec2(p.x, p.z) * 0.0625 + p.y * 0.06).r;
    if (n.y > 0.5) alb = vec3(0.30, 0.30, 0.30);
    spec = 0.05; gloss = 40.0;
    if (p.y < 10.0 && n.y < 0.5){   // the podium: a glazed lobby band between two stone bands
      float band = smoothstep(3.4, 3.5, p.y) * (1.0 - smoothstep(6.4, 6.5, p.y));
      alb = mix(alb, vec3(0.05, 0.06, 0.07), band);
      emis += vec3(1.0, 0.82, 0.58) * band * smoothstep(0.15, 0.4, u_night) * (1.0 - smoothstep(0.62, 0.9, u_night)) * 0.5;
    }
  } else if (id < 2.5){
    alb = mix(vec3(0.045, 0.115, 0.05), vec3(0.15, 0.29, 0.10), N1(vec2(p.x + p.z * 0.6, p.y + p.z * 0.4) * 0.069).b);
    n = bumpNormal(n, p, N2(p.xz * 0.6 + p.y).r, 0.06);   // a lumpy canopy instead of a perfect ball
    spec = 0.02; gloss = 12.0;
    // the landscape uplight under this tree
    vec4 t = treeAt(p.x < 10.0 ? 0.0 : 1.0, p.z);
    vec3 ld = p - vec3(t.x, 0.25, t.y);
    up += max(dot(n, -ld * inversesqrt(dot(ld, ld))), 0.0) / (1.0 + dot(ld, ld) * 0.9);
  } else if (id < 3.5){
    alb = vec3(0.16, 0.11, 0.07) * (0.8 + 0.4 * N2(vec2(atan(p.z, p.x) * 0.25, p.y * 0.1875)).b);
  } else if (id < 4.5){
    vec2 o = vec2(max(max(0.0 - p.x, p.x - 30.0), 0.0), max(max(18.0 - p.z, p.z - 30.0), 0.0));
    float paving = 1.0 - smoothstep(2.2, 2.5, length(o));
    vec3 grass = vec3(0.10, 0.21, 0.085) * (0.65 + 0.7 * N1(p.xz * 0.025).g);
    vec2 tg = abs(fract(p.xz / 0.8) - 0.5);
    vec3 stone = vec3(0.70, 0.68, 0.63) * (0.92 + 0.16 * hash21(floor(p.xz / 0.8)));
    stone = mix(stone, stone * 0.75, smoothstep(0.48, 0.5, max(tg.x, tg.y)));
    alb = mix(grass, stone, paving);
    spec = 0.03; gloss = 20.0;
  } else if (id < 5.5){
    alb = vec3(0.06, 0.06, 0.065); spec = 0.3; gloss = 80.0;
    if (p.y > 0.70 && p.y < 0.80) emis = vec3(1.0, 0.72, 0.40) * u_lamp * 7.0;
  } else {
    alb = liteAlbedo(p, emis);
    spec = 0.3; gloss = 30.0;
  }
  float ndl = max(dot(n, SUN), 0.0);
  float sh = (full > 0.5 && night < 0.98) ? softShadow(p + n * 0.02, SUN, 40.0) : 1.0;
  float ao = full > 0.5 ? calcAO(p, n) : 1.0;
  vec3 skyAmb = mix(mix(vec3(0.14, 0.12, 0.10), vec3(0.42, 0.52, 0.68), n.y * 0.5 + 0.5),
                    mix(vec3(0.010, 0.011, 0.015), vec3(0.030, 0.036, 0.050), n.y * 0.5 + 0.5), night);
  float lp = 0.0, li = clamp(floor((p.x + 2.0) / 5.0), 0.0, 5.0);
  for (int k = 0; k < 2; k++){
    vec3 ld = lampPos(int(li) + k) - p;
    lp += max(dot(n, ld * inversesqrt(dot(ld, ld))), 0.0) / (1.0 + dot(ld, ld) * 0.35) * lampFlick(int(li) + k);
  }
  vec3 col = alb * (sunCol * ndl * sh + skyAmb * ao + vec3(1.0, 0.62, 0.30) * (lp * 6.0 + up * 5.0) * u_lamp) + emis;
  vec3 wl = WIN_C - p;
  col += alb * vec3(1.0, 0.66, 0.34) * u_one * 1.2 * max(dot(n, wl * inversesqrt(dot(wl, wl))), 0.0) / (1.0 + dot(wl, wl) * 0.5);
  col += sunCol * pow(max(dot(n, normalize(SUN - rd)), 0.0), gloss) * spec * sh;
  // night-vision: the camera lights whatever is near it
  vec3 cl = g_cam - p; float cd2 = dot(cl, cl);
  col += alb * vec3(0.86, 0.92, 1.0) * u_ir * 2.4 * max(dot(n, cl * inversesqrt(cd2)), 0.0) / (1.0 + cd2 * 0.08);
  return col;
}
void main(){
  float e = clamp(u_camT, 0.0, 1.0); e = e * e * (3.0 - 2.0 * e);
  vec3 ro = mix(u_ro0, vec3(16.25, 40.6, 19.5), e);
  vec3 ta = mix(u_ta0, WIN_C, e);
  ro.z -= max(u_camT - 1.0, 0.0) * 9.5;
  g_cam = ro;
  vec2 uv = (2.0 * gl_FragCoord.xy - u_res) / u_res.y + u_shift;
  vec3 fwd = normalize(ta - ro);
  vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, fwd);
  vec3 rd = normalize(fwd * u_focal + right * uv.x + up * uv.y);

  float id; float t = trace(ro, rd, id);
  if (u_figOn > 0.5){ float tf = traceLite(ro, rd, t); if (tf > 0.0){ t = tf; id = 10.0; } }
  vec3 col;
  float night = smoothstep(0.5, 1.0, u_night);
  if (t > 0.0){
    vec3 p = ro + rd * t;
    bool water = id > 3.5 && id < 4.5 && p.x > 0.0 && p.x < 30.0 && p.z > 18.0 && p.z < 30.0;
    if (water){
      vec2 w = p.xz;
      float r1 = (N2(w * 0.094 + vec2(u_time * 0.008, u_time * 0.0034)).r - 0.5) * 0.030 + (N2(w * 0.28 - vec2(u_time * 0.0094, 0.0)).g - 0.5) * 0.010;
      float r2 = (N2(w * 0.094 + vec2(0.016 - u_time * 0.004, u_time * 0.0066)).b - 0.5) * 0.030 + (N2(w * 0.28 + vec2(0.3, u_time * 0.0084)).a - 0.5) * 0.010;
      vec3 wn = normalize(vec3(r1, 1.0, r2));
      vec3 rr = reflect(rd, wn);
      rr.y = abs(rr.y) + 0.01;
      vec3 rc = mirror(p + vec3(0.0, 0.002, 0.0), rr);
      vec3 deep = vec3(0.02, 0.035, 0.04) * (mix(1.0, 0.03, night) + u_lamp * night * 0.4);
      float fres = 0.02 + 0.98 * pow(1.0 - max(dot(-rd, wn), 0.0), 5.0);
      col = mix(deep, rc, 0.30 + 0.70 * fres);
    } else {
      vec3 n = id > 9.5 ? liteNormal(p) : calcNormal(p);
      col = shade(p, n, rd, id, 1.0);
    }
    float fogAmt = 1.0 - exp(-t * u_fog * (1.0 + 4.0 * exp(-max(p.y, 0.0) * 0.10)));
    vec3 fogCol = skyColor(rd) * mix(1.0, 0.5, night);
    col = mix(col, fogCol, fogAmt);
  } else col = skyColor(rd);

  // halos: path lamps and the window
  for (int i = 0; i < 7; i++){
    vec3 toL = lampPos(i) - ro;
    float dd = length(toL), ca = dot(rd, toL / dd);
    if (ca > 0.0 && dd < t) col += vec3(1.0, 0.66, 0.34) * u_lamp * lampFlick(i) * 1.6 / (1.0 + (1.0 - ca * ca) * dd * dd * 90.0);
  }
  {
    vec3 toW = WIN_C - ro;
    float dd = length(toW), ca = dot(rd, toW / dd);
    if (ca > 0.0 && dd < t) col += vec3(1.0, 0.66, 0.34) * u_one * night * 0.6 / (1.0 + (1.0 - ca * ca) * dd * dd * 30.0);
  }
  col = 1.0 - exp(-col * u_exp);
  fragColor = vec4(col, 1.0);
}
`;

  // ---------------- POST: lens, tape, grain ----------------
  const POST = COMMON + `
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform float u_dist, u_ca, u_grain, u_scan, u_static, u_vig, u_flash, u_glitch, u_ir, u_fade, u_gain, u_bar, u_seed, u_track, u_invert, u_sat;
uniform vec3 u_tint, u_lift;
const vec3 LUMA = vec3(0.299, 0.587, 0.114);

vec3 fxaa(vec2 uv){
  vec3 rgbNW = textureOffset(u_tex, uv, ivec2(-1, -1)).rgb;
  vec3 rgbNE = textureOffset(u_tex, uv, ivec2( 1, -1)).rgb;
  vec3 rgbSW = textureOffset(u_tex, uv, ivec2(-1,  1)).rgb;
  vec3 rgbSE = textureOffset(u_tex, uv, ivec2( 1,  1)).rgb;
  vec3 rgbM  = texture(u_tex, uv).rgb;
  float lNW = dot(rgbNW, LUMA), lNE = dot(rgbNE, LUMA), lSW = dot(rgbSW, LUMA), lSE = dot(rgbSE, LUMA), lM = dot(rgbM, LUMA);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.03, lMax * 0.125)) return rgbM;
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float dirReduce = max((lNW + lNE + lSW + lSE) * (0.25 / 8.0), 1.0 / 128.0 - 1e-5);
  float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = clamp(dir * rcpDirMin, vec2(-8.0), vec2(8.0)) * u_texel;
  vec3 rgbA = 0.5 * (texture(u_tex, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture(u_tex, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 rgbB = rgbA * 0.5 + 0.25 * (texture(u_tex, uv + dir * -0.5).rgb + texture(u_tex, uv + dir * 0.5).rgb);
  float lB = dot(rgbB, LUMA);
  return (lB < lMin || lB > lMax) ? rgbA : rgbB;
}
void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  vec2 c = uv - 0.5; c.x *= aspect;
  float seed = floor(u_seed * 7.0);
  float row = floor(gl_FragCoord.y / 4.0);
  float gsel = step(1.0 - u_glitch * 0.30, hash11(row * 1.31 + seed));
  vec2 d = c * (1.0 + u_dist * dot(c, c));
  d.x /= aspect;
  vec2 suv = d + 0.5;
  suv.x += (hash11(row * 7.3 + seed) - 0.5) * 0.22 * u_glitch * gsel;
  vec3 col = fxaa(suv);
  if (u_ca > 0.001){
    vec2 off = c * u_ca * 0.006;
    col.r = mix(col.r, texture(u_tex, suv + off).r, 0.6);
    col.b = mix(col.b, texture(u_tex, suv - off).b, 0.6);
  }
  if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) col = vec3(0.0);
  float lum = dot(col, LUMA);
  vec3 irc = vec3(0.90, 1.0, 0.94) * lum * 1.7 / (1.0 + lum * 0.8);
  irc *= 1.0 - 0.75 * smoothstep(0.15, 1.05, length(c));
  col = mix(col, irc, u_ir);
  col = mix(col, vec3(hash21(gl_FragCoord.xy * 1.7 + fract(u_seed) * 371.0)), clamp(u_static, 0.0, 1.0));
  col *= 1.0 - u_scan * 0.30 * (0.5 + 0.5 * sin(gl_FragCoord.y * 3.14159));
  float band = fract(uv.y - u_time * 0.13) - 0.5;
  col *= 1.0 - u_track * 0.45 * exp(-pow(band * 14.0, 2.0));
  col += u_track * 0.08 * exp(-pow((band - 0.02) * 40.0, 2.0));
  col = col * u_gain * u_tint + u_lift;
  col = mix(col, 1.0 - col, u_invert);
  col = 1.0 - exp(-col * 1.25);
  col = mix(vec3(dot(col, LUMA)), col, u_sat);
  col += u_flash;
  col *= 1.0 - u_vig * smoothstep(0.15, 1.0, length(c * vec2(1.0, 1.12)));
  col += (hash21(gl_FragCoord.xy * 1.37 + fract(u_seed * 3.1) * 101.0) - 0.5) * u_grain * (0.3 + 0.7 * (1.0 - clamp(lum, 0.0, 1.0)));
  float bar = u_bar * min(0.5 * (1.0 - aspect / 2.0), 0.16);
  col *= smoothstep(bar - 0.004, bar + 0.004, uv.y) * (1.0 - smoothstep(1.0 - bar - 0.004, 1.0 - bar + 0.004, uv.y));
  fragColor = vec4(clamp(col * (1.0 - u_fade), 0.0, 1.0), 1.0);
}
`;

  return { VS, INTERIOR, EXTERIOR, POST };
})();
