'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

// --- 1. Math Utils ---
const getConePosition = (radius, height, yOffset = -2) => {
  const y = Math.random() * height;
  const r = (radius * (height - y)) / height;
  const theta = Math.random() * Math.PI * 2;
  const randomR = r * Math.sqrt(Math.random());
  return { x: randomR * Math.cos(theta), y: y + yOffset, z: randomR * Math.sin(theta) };
};

const getSpherePosition = (radius) => {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  const r = Math.cbrt(Math.random()) * radius;
  const sinPhi = Math.sin(phi);
  return { x: r * sinPhi * Math.cos(theta), y: r * sinPhi * Math.sin(theta), z: r * Math.cos(phi) };
};

// --- 2. Shader Code ---
const foliageVertexShader = `
  uniform float uTime;
  uniform float uProgress;
  uniform vec3 uBaseColor;
  attribute vec3 aTreePos;
  attribute vec3 aScatterPos;
  attribute float aRandom;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float t = uProgress;
    float ease = t * t * (3.0 - 2.0 * t);
    vec3 pos = mix(aScatterPos, aTreePos, ease);
    float breathe = sin(uTime * 2.0 + aRandom * 10.0) * 0.05 * ease;
    pos += normalize(pos) * breathe;
    if(uProgress < 0.9) {
       pos.y += sin(uTime * 0.5 + aRandom * 100.0) * 0.2 * (1.0 - ease);
       pos.x += cos(uTime * 0.3 + aRandom * 50.0) * 0.2 * (1.0 - ease);
    }
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = (8.0 * aRandom + 4.0) * (20.0 / -mvPosition.z);
    vColor = mix(vec3(0.8, 0.6, 0.2), uBaseColor, ease); 
    vAlpha = 0.8 + 0.2 * sin(uTime * 3.0 + aRandom * 20.0);
  }
`;

const foliageFragmentShader = `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.5) discard;
    float glow = 1.0 - (dist * 2.0);
    glow = pow(glow, 1.5);
    vec3 finalColor = vColor * glow;
    finalColor += vec3(1.0, 1.0, 0.8) * (glow * 0.8) * smoothstep(0.0, 0.1, dist);
    gl_FragColor = vec4(finalColor, vAlpha * glow);
  }
`;

// Helper to load Three.js from CDN
const loadScript = (src) => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

export default function ArixTree() {
  const mountRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isTree, setIsTree] = useState(false);
  const [accentColor, setAccentColor] = useState("#004225");

  const stateRef = useRef({ isTree: false, accentColor: "#004225" });
  const sceneObjects = useRef({});

  useEffect(() => {
    stateRef.current.isTree = isTree;
    stateRef.current.accentColor = accentColor;
  }, [isTree, accentColor]);

  // --- 3. Initialize Three.js Engine ---
  useEffect(() => {
    let animationFrameId;
    let renderer;
    let scene;
    let camera;
    let controls;
    let cleanup = () => {};

    const init = async () => {
      try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
        await loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js');
        
        const THREE = window.THREE;
        
        const width = mountRef.current.clientWidth;
        const height = mountRef.current.clientHeight;
        
        scene = new THREE.Scene();
        scene.background = new THREE.Color("#000502");
        scene.fog = new THREE.Fog("#000502", 10, 50);

        camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
        camera.position.set(0, 4, 25);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.toneMapping = THREE.ReinhardToneMapping;
        renderer.toneMappingExposure = 1.5;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        mountRef.current.appendChild(renderer.domElement);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enablePan = false;
        controls.minPolarAngle = Math.PI / 3;
        controls.maxPolarAngle = Math.PI / 1.8;
        controls.maxDistance = 30;
        controls.minDistance = 10;
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;

        const ambientLight = new THREE.AmbientLight(0x004225, 0.4);
        scene.add(ambientLight);
        sceneObjects.current.ambient = ambientLight;

        const spotLight = new THREE.SpotLight(0xffeedd, 30);
        spotLight.position.set(10, 20, 10);
        spotLight.angle = 0.3;
        spotLight.penumbra = 1;
        spotLight.castShadow = true;
        scene.add(spotLight);

        const pointLight = new THREE.PointLight(0x004225, 8, 100);
        pointLight.position.set(-10, 5, -10);
        scene.add(pointLight);
        sceneObjects.current.point = pointLight;

        const fCount = 6000;
        const fGeo = new THREE.BufferGeometry();
        const fTreePos = new Float32Array(fCount * 3);
        const fScatterPos = new Float32Array(fCount * 3);
        const fRandoms = new Float32Array(fCount);

        for (let i = 0; i < fCount; i++) {
          const tp = getConePosition(4, 9, -4);
          const sp = getSpherePosition(15);
          fTreePos.set([tp.x, tp.y, tp.z], i * 3);
          fScatterPos.set([sp.x, sp.y, sp.z], i * 3);
          fRandoms[i] = Math.random();
        }

        fGeo.setAttribute('position', new THREE.BufferAttribute(fTreePos, 3));
        fGeo.setAttribute('aTreePos', new THREE.BufferAttribute(fTreePos, 3));
        fGeo.setAttribute('aScatterPos', new THREE.BufferAttribute(fScatterPos, 3));
        fGeo.setAttribute('aRandom', new THREE.BufferAttribute(fRandoms, 1));

        const foliageMat = new THREE.ShaderMaterial({
          vertexShader: foliageVertexShader,
          fragmentShader: foliageFragmentShader,
          uniforms: {
            uTime: { value: 0 },
            uProgress: { value: 0 },
            uBaseColor: { value: new THREE.Color("#004225") }
          },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        });

        const foliagePoints = new THREE.Points(fGeo, foliageMat);
        scene.add(foliagePoints);

        const createOrnamentLayer = (count, geometry, material, scaleBase, weightFactor, colorVar = false) => {
          const mesh = new THREE.InstancedMesh(geometry, material, count);
          mesh.castShadow = true;
          mesh.receiveShadow = true;

          const data = [];
          const dummy = new THREE.Object3D();
          const _color = new THREE.Color();
          const palette = [new THREE.Color("#D4AF37"), new THREE.Color("#004225"), new THREE.Color("#800020")];
          
          if(colorVar) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);

          for(let i=0; i<count; i++){
             const tp = getConePosition(4.2, 8.5, -4);
             const sp = getSpherePosition(18);
             const scale = scaleBase * (0.8 + Math.random() * 0.4);
             data.push({ 
               treePos: new THREE.Vector3(tp.x, tp.y, tp.z), 
               scatterPos: new THREE.Vector3(sp.x, sp.y, sp.z), 
               currentPos: new THREE.Vector3(sp.x, sp.y, sp.z),
               scale 
             });

             if(colorVar) {
                _color.copy(palette[Math.floor(Math.random() * palette.length)]);
                mesh.setColorAt(i, _color);
             }
             
             dummy.position.copy(data[i].currentPos);
             dummy.scale.setScalar(scale * 0.6);
             dummy.updateMatrix();
             mesh.setMatrixAt(i, dummy.matrix);
          }
          if(colorVar) mesh.instanceColor.needsUpdate = true;
          mesh.instanceMatrix.needsUpdate = true;
          scene.add(mesh);
          return { mesh, data, weightFactor };
        };

        const sphereGeo = new THREE.SphereGeometry(1, 16, 16);
        const boxGeo = new THREE.BoxGeometry(1, 1, 1);
        
        const goldMat = new THREE.MeshStandardMaterial({ color: "#FFD700", roughness: 0.15, metalness: 1.0 });
        const redMat = new THREE.MeshStandardMaterial({ color: "#800020", roughness: 0.3, metalness: 0.4 });
        const sparkleMat = new THREE.MeshBasicMaterial({ color: "#ffffee" });

        const ornaments = [
          createOrnamentLayer(200, sphereGeo, goldMat, 0.15, 0.8),
          createOrnamentLayer(50, boxGeo, redMat, 0.3, 1.5, true),
          createOrnamentLayer(400, sphereGeo, sparkleMat, 0.04, 0.3)
        ];

        const floorMat = new THREE.MeshStandardMaterial({ color: "#004225", roughness: 0.1, metalness: 0.8, opacity: 0.3, transparent: true });
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -4.5;
        floor.receiveShadow = true;
        scene.add(floor);
        sceneObjects.current.floor = floor;

        const starGroup = new THREE.Group();
        const octGeo = new THREE.OctahedronGeometry(0.4, 0);
        const octMat = new THREE.MeshStandardMaterial({ color: "#FFF", emissive: "#FFD700", emissiveIntensity: 4 });
        const octMesh = new THREE.Mesh(octGeo, octMat);
        const torusGeo = new THREE.TorusGeometry(0.6, 0.02, 16, 50);
        const torusMat = new THREE.MeshBasicMaterial({ color: "#FFD700" });
        const torusMesh = new THREE.Mesh(torusGeo, torusMat);
        torusMesh.rotation.x = Math.PI / 2;
        starGroup.add(octMesh, torusMesh);
        starGroup.position.set(0, 10, 0);
        scene.add(starGroup);

        const clock = new THREE.Clock();
        const dummy = new THREE.Object3D();

        const animate = () => {
          animationFrameId = requestAnimationFrame(animate);
          const time = clock.getElapsedTime();
          const { isTree: treeState, accentColor: colorState } = stateRef.current;
          
          if(treeState) {
              controls.autoRotate = true;
              controls.autoRotateSpeed = 0.5;
          } else {
              controls.autoRotate = false;
          }
          controls.update();

          const targetColor = new THREE.Color(colorState);
          foliageMat.uniforms.uBaseColor.value.lerp(targetColor, 0.05);
          if(sceneObjects.current.floor) sceneObjects.current.floor.material.color.lerp(targetColor, 0.05);
          if(sceneObjects.current.ambient) sceneObjects.current.ambient.color.lerp(targetColor, 0.05);
          if(sceneObjects.current.point) sceneObjects.current.point.color.lerp(targetColor, 0.05);

          const targetProgress = treeState ? 1.0 : 0.0;
          foliageMat.uniforms.uProgress.value = THREE.MathUtils.lerp(foliageMat.uniforms.uProgress.value, targetProgress, 0.03);
          foliageMat.uniforms.uTime.value = time;

          ornaments.forEach(layer => {
            const lerpSpeed = 0.02 / layer.weightFactor;
            layer.data.forEach((item, i) => {
               const targetPos = treeState ? item.treePos : item.scatterPos;
               item.currentPos.lerp(targetPos, lerpSpeed);
               
               const floatAmp = treeState ? 0.02 : 0.1;
               const floatFreq = treeState ? 1.0 : 0.5;

               dummy.position.copy(item.currentPos);
               dummy.position.y += Math.sin(time * floatFreq + i) * floatAmp;
               dummy.position.x += Math.cos(time * floatFreq * 0.5 + i) * floatAmp;
               dummy.rotation.x = time * 0.2 + i;
               dummy.rotation.y = time * 0.3 + i;
               
               let s = item.scale * (treeState ? 1 : 0.0);
               if (!treeState) s = item.scale * 0.6;
               dummy.scale.setScalar(s);
               
               dummy.updateMatrix();
               layer.mesh.setMatrixAt(i, dummy.matrix);
            });
            layer.mesh.instanceMatrix.needsUpdate = true;
          });

          starGroup.rotation.y = time * 0.5;
          const starTargetY = treeState ? 5.2 : 12.0;
          starGroup.position.y = THREE.MathUtils.lerp(starGroup.position.y, starTargetY, 0.05);
          const starScale = THREE.MathUtils.lerp(starGroup.scale.x, treeState ? 1.0 : 0.0, 0.05);
          starGroup.scale.setScalar(starScale);

          renderer.render(scene, camera);
        };

        animate();
        setIsLoaded(true);
        
        cleanup = () => {
          if (mountRef.current && renderer.domElement) {
            mountRef.current.removeChild(renderer.domElement);
          }
          renderer.dispose();
          fGeo.dispose();
          foliageMat.dispose();
          ornaments.forEach(o => { 
            o.mesh.geometry.dispose(); 
            o.mesh.material.dispose(); 
          });
        };

      } catch (err) {
        console.error("Three.js Init Error", err);
      }
    };

    init();

    const handleResize = () => {
        if (camera && renderer && mountRef.current) {
            camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
        }
    };
    window.addEventListener('resize', handleResize);

    return () => {
        window.removeEventListener('resize', handleResize);
        cancelAnimationFrame(animationFrameId);
        cleanup();
    };
  }, []);

  return (
    <div className="w-full h-screen bg-[#000502] relative overflow-hidden font-sans text-white">
      <div ref={mountRef} className="absolute inset-0 z-0">
          {!isLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#000502] z-50">
                  <div className="flex flex-col items-center gap-4">
                      <Loader2 className="animate-spin text-[#D4AF37]" size={32} />
                      <p className="text-[#D4AF37] text-xs tracking-[0.3em] animate-pulse">INITIALIZING ARIX ENGINE...</p>
                  </div>
              </div>
          )}
      </div>

      <div className="absolute top-0 left-0 w-full h-full pointer-events-none flex flex-col justify-between p-6 md:p-12 z-10">
        <div className="flex justify-between items-start pointer-events-auto">
            <div>
                <h1 className="text-4xl md:text-5xl font-serif tracking-tighter text-[#D4AF37] drop-shadow-lg">ARIX</h1>
                <p className="text-[10px] md:text-xs text-emerald-100 tracking-[0.3em] uppercase mt-2">Signature Collection</p>
            </div>
        </div>

        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-auto text-center">
            <button onClick={() => setIsTree(!isTree)} className="group relative px-8 py-4 bg-black/20 backdrop-blur-md border border-[#D4AF37]/30 hover:bg-[#D4AF37]/10 hover:border-[#D4AF37] transition-all duration-700 ease-out rounded-full overflow-hidden">
                <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-[#D4AF37]/20 to-transparent transform -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                <span className="relative text-[#D4AF37] font-serif tracking-widest text-lg md:text-xl">{isTree ? "SCATTER" : "ASSEMBLE"}</span>
            </button>
        </div>

        <div className="flex justify-between items-end pointer-events-auto">
            <div className="text-[#D4AF37] text-xs font-mono h-4">{accentColor !== "#004225" && <span className="opacity-80 animate-pulse">AURA SHIFT DETECTED: {accentColor}</span>}</div>
            <div className="flex gap-4 text-[#D4AF37] text-sm font-bold opacity-80"><span>INT.</span><span>EXP.</span><span>LUX.</span></div>
        </div>
      </div>
      <style jsx>{`
        @keyframes fadeInDown { 
          from { opacity: 0; transform: translateY(-10px); } 
          to { opacity: 1; transform: translateY(0); } 
        } 
        .animate-fade-in-down { 
          animation: fadeInDown 0.5s ease-out forwards; 
        }
      `}</style>
    </div>
  );
}
