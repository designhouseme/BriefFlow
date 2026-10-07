import { useEffect, useRef, useState } from "react";
import { Orb } from "./Orb";

// Kula na powitaniu jako shader: w środku powoli płynie światło (zaszumiony gradient w barwach kuli),
// wokół oddycha miękka poświata. Bez WebGL zostaje zwykły obraz kuli; przy „ogranicz ruch” jedna klatka.

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float r = length(uv);
  float R = 0.21;
  float t = uTime * 0.11;

  vec3 deep = vec3(0.247, 0.357, 0.941);
  vec3 mid = vec3(0.494, 0.592, 1.0);
  vec3 light = vec3(0.788, 0.839, 1.0);
  vec3 violet = vec3(0.549, 0.482, 1.0);

  vec3 col = vec3(0.0);
  float alpha = 0.0;
  if (r < R) {
    float z = sqrt(R * R - r * r) / R;
    vec3 n = normalize(vec3(uv / R, z));
    // Światło płynie po powierzchni kuli: szum zniekształcony drugim szumem.
    vec2 q = n.xy * 1.7;
    vec2 w = vec2(fbm(q + vec2(t, -t * 0.7)), fbm(q + vec2(-t * 0.8, t) + 3.1));
    float f = fbm(q * 1.2 + w * 1.9 + t * 0.4);
    // Delikatnie: najciemniejsze miejsca to wciąż jasny błękit, a nie granat.
    col = mix(mix(deep, mid, 0.45), light, smoothstep(0.35, 0.85, f) * 0.55);
    col = mix(col, violet, smoothstep(0.6, 0.95, w.y) * 0.22);
    vec3 L = normalize(vec3(-0.55, 0.65, 0.75));
    float diff = clamp(dot(n, L), 0.0, 1.0);
    col = mix(col * 0.88, light, pow(diff, 3.0) * 0.6);
    float spec = pow(clamp(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 28.0);
    col += spec * 0.22;
    col = mix(col, violet, pow(1.0 - z, 3.0) * 0.45);
    alpha = smoothstep(R, R - 0.004, r);
  }
  // Poświata w tle: szybko zanika, lekko oddycha.
  float glow = exp(-pow(max(r - R, 0.0) / 0.16, 1.3)) * (0.3 + 0.07 * sin(uTime * 0.55));
  // Do zera przed krawędzią płótna, inaczej widać jaśniejszy kwadrat.
  glow *= smoothstep(0.5, 0.36, r);
  vec3 outCol = col * alpha + mid * glow * (1.0 - alpha);
  float outA = alpha + glow * (1.0 - alpha);
  gl_FragColor = vec4(outCol, outA);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

/**
 * `size` to bok płótna (z poświatą); sama kula ma ok. 42% tej szerokości. Duże płótno (hero) kosztuje
 * kilka razy więcej, więc gęstość pikseli ma limit (`maxDpr`), a rysowanie staje, gdy płótno zjedzie z ekranu.
 */
export function ShaderOrb({ size = 240, className = "", maxDpr = 2 }: { size?: number; className?: string; maxDpr?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    const gl = canvas?.getContext("webgl", { premultipliedAlpha: true, antialias: true });
    const vs = gl && compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = gl && compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl?.createProgram();
    if (!canvas || !gl || !vs || !fs || !program) return setFallback(true);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return setFallback(true);
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const scale = Math.min(window.devicePixelRatio || 1, maxDpr);
    canvas.width = Math.round(size * scale);
    canvas.height = Math.round(size * scale);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(gl.getUniformLocation(program, "uRes"), canvas.width, canvas.height);
    const uTime = gl.getUniformLocation(program, "uTime");
    gl.clearColor(0, 0, 0, 0);

    const draw = (seconds: number) => {
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uTime, seconds);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      draw(12);
      return;
    }
    let frame = 0;
    let visible = true;
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    observer.observe(canvas);
    const start = performance.now();
    const loop = (now: number) => {
      if (visible && !document.hidden) draw((now - start) / 1000 + 12);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [size, maxDpr]);

  if (fallback) return <Orb size={Math.round(size * 0.42)} className={className} />;
  return <canvas ref={ref} className={`shader-orb ${className}`} style={{ width: size, height: size }} aria-hidden />;
}
