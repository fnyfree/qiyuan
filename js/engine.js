/* Minimal WebGL2 engine: scene pass -> offscreen texture -> film / tape post pass.
   Surface noise is baked once into three tileable textures instead of being evaluated in the shader:
   it keeps the shaders small enough to compile quickly and gives the surfaces mip-maps. */
window.QYEngine = (function () {
  const SRC = { int: 'INTERIOR', ext: 'EXTERIOR', post: 'POST' };
  const NOISE = (function () {
    const N = 256;
    const h = (x, y, s) => { let n = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
    // value noise on a lattice that wraps every `cells` entries, so the tile repeats seamlessly
    const vn = (x, y, cells, s) => {
      const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      const w = (i, j) => h(((i % cells) + cells) % cells, ((j % cells) + cells) % cells, s);
      return (w(xi, yi) * (1 - u) + w(xi + 1, yi) * u) * (1 - v) + (w(xi, yi + 1) * (1 - u) + w(xi + 1, yi + 1) * u) * v;
    };
    const bake = (fill) => {
      const d = new Uint8Array(N * N * 4);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) for (let c = 0; c < 4; c++) d[(y * N + x) * 4 + c] = Math.round(255 * Math.min(1, Math.max(0, fill(x, y, c))));
      return d;
    };
    const fbm = (u, v, s) => { let a = 0.5, sum = 0; for (let o = 0; o < 4; o++) { sum += a * vn(u * (32 << o), v * (32 << o), 32 << o, s + o * 17); a *= 0.5; } return sum / 0.9375; };
    return [
      bake((x, y, c) => fbm(x / N, y / N, c * 101)),              // n1: four fbm fields
      bake((x, y, c) => vn(x / N * 32, y / N * 32, 32, c * 53 + 7)),   // n2: four smooth fields, 32 cells per tile
      bake((x, y, c) => h(x + c * 977, y, 4211)),                  // n3: white noise
    ];
  })();
  return class Engine {
    // opts.programs: which programs to build right now (default: all). More can be built later with warm().
    constructor(canvas, opts = {}) {
      const gl = canvas.getContext('webgl2', {
        antialias: false, alpha: false, depth: false, stencil: false,
        preserveDrawingBuffer: !!opts.preserve, powerPreference: 'high-performance',
      });
      if (!gl) throw new Error('WebGL2 unavailable');
      this.gl = gl; this.canvas = canvas; this.sw = 0; this.sh = 0; this.progs = {};
      this.tex = gl.createTexture(); this.fbo = gl.createFramebuffer();
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      for (const k of ['TEXTURE_MIN_FILTER', 'TEXTURE_MAG_FILTER']) gl.texParameteri(gl.TEXTURE_2D, gl[k], gl.LINEAR);
      for (const k of ['TEXTURE_WRAP_S', 'TEXTURE_WRAP_T']) gl.texParameteri(gl.TEXTURE_2D, gl[k], gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
      this.buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      this.noise = NOISE.map((data) => {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        return t;
      });
      const aniso = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
      if (aniso) this.noise.forEach((t) => {
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      });
      this.warm(opts.programs || Object.keys(SRC));
    }
    program(name) {
      if (this.progs[name]) return this.progs[name];
      const gl = this.gl;
      const mk = (type, code, label) => {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, code); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
          const log = gl.getShaderInfoLog(sh), lines = code.split('\n');
          const ctx = [...new Set((log.match(/ERROR: \d+:(\d+)/g) || []).map((m) => +m.split(':')[1]))]
            .map((no) => lines.slice(no - 2, no + 1).map((l, i) => (no - 1 + i) + ': ' + l).join('\n')).join('\n---\n');
          throw new Error('shader compile failed: ' + name + '/' + label + '\n' + log + '\n' + ctx);
        }
        return sh;
      };
      const p = gl.createProgram();
      gl.attachShader(p, mk(gl.VERTEX_SHADER, QY_GLSL.VS, 'vs'));
      gl.attachShader(p, mk(gl.FRAGMENT_SHADER, QY_GLSL[SRC[name]], 'fs'));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link failed: ' + name + ' ' + gl.getProgramInfoLog(p));
      const locs = {}, count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(p, i);
        locs[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
      }
      this.progs[name] = { p, locs, aPos: gl.getAttribLocation(p, 'a_pos') };
      return this.progs[name];
    }
    warm(list) { list.forEach((n) => this.program(n)); }
    // canvas buffer = w x h; the scene itself is rendered at w x h * sceneScale and upscaled by the post pass
    fit(w, h, sceneScale = 1) {
      const gl = this.gl;
      w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
      if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
      const sw = Math.max(2, Math.round(w * sceneScale)), sh = Math.max(2, Math.round(h * sceneScale));
      if (this.sw !== sw || this.sh !== sh) {
        this.sw = sw; this.sh = sh;
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, sw, sh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }
    }
    set(P, name, v) {
      const loc = P.locs[name];
      if (loc === undefined || loc === null) return;
      const gl = this.gl;
      if (v === null || v === undefined) throw new Error('uniform ' + name + ' has no value');
      if (typeof v === 'number') gl.uniform1f(loc, v);
      else if (v.length === 2) gl.uniform2fv(loc, v);
      else if (v.length === 3) gl.uniform3fv(loc, v);
      else if (v.length === 4) gl.uniform4fv(loc, v);
      else gl.uniform1fv(loc, v);
    }
    verts(P) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      gl.enableVertexAttribArray(P.aPos);
      gl.vertexAttribPointer(P.aPos, 2, gl.FLOAT, false, 0, 0);
    }
    render(scene, params, post, time, sceneScale = 1) {
      const gl = this.gl, P = this.program(scene), Q = this.program('post');
      this.fit(this.canvas.width, this.canvas.height, sceneScale);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.viewport(0, 0, this.sw, this.sh);
      gl.useProgram(P.p); this.verts(P);
      ['u_n1', 'u_n2', 'u_n3'].forEach((name, i) => {
        gl.activeTexture(gl.TEXTURE1 + i);
        gl.bindTexture(gl.TEXTURE_2D, this.noise[i]);
        if (P.locs[name]) gl.uniform1i(P.locs[name], 1 + i);
      });
      this.set(P, 'u_res', [this.sw, this.sh]);
      this.set(P, 'u_time', time);
      for (const k in params) this.set(P, k, params[k]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.useProgram(Q.p); this.verts(Q);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.uniform1i(Q.locs.u_tex, 0);
      this.set(Q, 'u_res', [this.canvas.width, this.canvas.height]);
      this.set(Q, 'u_time', time);
      this.set(Q, 'u_texel', [1 / this.sw, 1 / this.sh]);
      for (const k in post) this.set(Q, k, post[k]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  };
})();
