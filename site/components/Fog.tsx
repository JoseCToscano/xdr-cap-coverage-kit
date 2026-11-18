"use client";
import { useEffect, useRef } from "react";
import { reducedMotion } from "@/lib/useInView";

// The demo video's fog: fbm noise in a fragment shader on a 1/3-resolution canvas.
// One static frame for reduced motion; a CSS gradient if WebGL is missing.
export function Fog() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const gl = c.getContext("webgl", { antialias: false, preserveDrawingBuffer: false });
    const size = () => { c.width = Math.max(1, Math.round(innerWidth / 3)); c.height = Math.max(1, Math.round(innerHeight / 3)); gl?.viewport(0, 0, c.width, c.height); };
    size(); addEventListener("resize", size);
    if (!gl) { c.style.background = "radial-gradient(ellipse at 30% 40%,#2a2925,#161513 70%)"; return () => removeEventListener("resize", size); }
    const vs = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
    const fs = `precision mediump float;uniform vec2 r;uniform float t;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.02+vec2(1.7,9.2);a*=.5;}return v;}
void main(){vec2 uv=gl_FragCoord.xy/r;vec2 p=uv*vec2(r.x/r.y,1.)*2.2;
float q=fbm(p+vec2(t*.018,t*.011));float w=fbm(p*1.3+vec2(q*1.8,-t*.014)+3.1);
vec3 a=vec3(.086,.082,.075),b=vec3(.165,.157,.141),c2=vec3(.215,.204,.184);
vec3 col=mix(a,b,smoothstep(.25,.85,w));col=mix(col,c2,smoothstep(.62,.95,w*q*1.6)*.55);
col*=1.-.35*length(uv-.5);col+=(h(gl_FragCoord.xy+t)-.5)*.012;gl_FragColor=vec4(col,1.);}`;
    const sh = (t: number, s: string) => { const o = gl.createShader(t)!; gl.shaderSource(o, s); gl.compileShader(o); return o; };
    const pr = gl.createProgram()!; gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr); gl.useProgram(pr);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const ur = gl.getUniformLocation(pr, "r"), ut = gl.getUniformLocation(pr, "t"); const t0 = performance.now();
    let raf = 0; const still = reducedMotion();
    const loop = (n: number) => {
      gl.uniform2f(ur, c.width, c.height); gl.uniform1f(ut, (n - t0) / 1000 + 40); gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!still && !document.hidden) raf = requestAnimationFrame(loop);
    };
    const vis = () => { if (!document.hidden && !still) { cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); } };
    document.addEventListener("visibilitychange", vis);
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", size); document.removeEventListener("visibilitychange", vis); };
  }, []);
  return <canvas ref={ref} className="fogc" aria-hidden="true" />;
}
