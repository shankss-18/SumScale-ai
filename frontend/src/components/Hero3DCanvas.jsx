import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Hero3DCanvas — Real Three.js WebGL Interactive 3D Canvas
 * Features: Interactive 3D Particle Sphere, 3D Celestial Star Lattice,
 * inner counter-rotating star crystal, and responsive mouse-tracking rotation.
 */
export default function Hero3DCanvas() {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ── 1. Scene, Camera & Renderer Setup ────────────────────────────
    const scene = new THREE.Scene();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 7.5;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // ── 2. Lights ────────────────────────────────────────────────────
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    const pointLight1 = new THREE.PointLight(0x83c5be, 4, 50);
    pointLight1.position.set(6, 6, 6);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0x006d77, 5, 50);
    pointLight2.position.set(-6, -6, -2);
    scene.add(pointLight2);

    // ── 3. 3D Objects Group ──────────────────────────────────────────
    const mainGroup = new THREE.Group();
    scene.add(mainGroup);

    // Core 3D Sphere Points (Fiber/Data Lattice)
    const sphereGeo = new THREE.IcosahedronGeometry(2.0, 4);

    const pointsMat = new THREE.PointsMaterial({
      color: 0x006d77,
      size: 0.05,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });
    const pointsMesh = new THREE.Points(sphereGeo, pointsMat);
    mainGroup.add(pointsMesh);

    // Inner Wireframe Mesh
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x83c5be,
      wireframe: true,
      transparent: true,
      opacity: 0.2,
    });
    const wireMesh = new THREE.Mesh(sphereGeo, wireMat);
    mainGroup.add(wireMesh);

    // ── 3D CELESTIAL STAR SYSTEM (Replaces plain rings) ─────────────
    const starGroup = new THREE.Group();
    mainGroup.add(starGroup);

    // Outer 3D Star Crystal Mesh (Octahedron Geometry)
    const starGeo = new THREE.OctahedronGeometry(3.3, 0);
    const starEdges = new THREE.EdgesGeometry(starGeo);
    const starLineMat = new THREE.LineBasicMaterial({
      color: 0x006d77,
      linewidth: 2,
      transparent: true,
      opacity: 0.75,
    });
    const starLines = new THREE.LineSegments(starEdges, starLineMat);
    starGroup.add(starLines);

    // Star Corner Glowing Nodes
    const starPointsMat = new THREE.PointsMaterial({
      color: 0x83c5be,
      size: 0.12,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    const starPointsMesh = new THREE.Points(starGeo, starPointsMat);
    starGroup.add(starPointsMesh);

    // Nested Counter-Rotating 3D Inner Star Crystal (Icosahedron Geometry)
    const innerStarGeo = new THREE.IcosahedronGeometry(2.7, 0);
    const innerStarEdges = new THREE.EdgesGeometry(innerStarGeo);
    const innerStarLineMat = new THREE.LineBasicMaterial({
      color: 0x83c5be,
      linewidth: 1.5,
      transparent: true,
      opacity: 0.5,
    });
    const innerStarLines = new THREE.LineSegments(innerStarEdges, innerStarLineMat);
    starGroup.add(innerStarLines);

    // Floating 3D Background Particles Field
    const bgParticlesCount = 400;
    const bgGeo = new THREE.BufferGeometry();
    const bgPositions = new Float32Array(bgParticlesCount * 3);

    for (let i = 0; i < bgParticlesCount * 3; i += 3) {
      bgPositions[i] = (Math.random() - 0.5) * 18;
      bgPositions[i + 1] = (Math.random() - 0.5) * 18;
      bgPositions[i + 2] = (Math.random() - 0.5) * 18;
    }
    bgGeo.setAttribute('position', new THREE.BufferAttribute(bgPositions, 3));

    const bgMat = new THREE.PointsMaterial({
      color: 0x006d77,
      size: 0.04,
      transparent: true,
      opacity: 0.45,
    });
    const bgPoints = new THREE.Points(bgGeo, bgMat);
    scene.add(bgPoints);

    // ── 4. Interactive Mouse Control ─────────────────────────────────
    let mouseX = 0;
    let mouseY = 0;
    let targetRotationX = 0;
    let targetRotationY = 0;

    const handleMouseMove = (event) => {
      const windowHalfX = window.innerWidth / 2;
      const windowHalfY = window.innerHeight / 2;
      mouseX = (event.clientX - windowHalfX) * 0.0035;
      mouseY = (event.clientY - windowHalfY) * 0.0035;
    };

    window.addEventListener('mousemove', handleMouseMove);

    // ── 5. Resize Listener ───────────────────────────────────────────
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    // ── 6. Animation Loop ────────────────────────────────────────────
    let animationFrameId;
    let clock = new THREE.Clock();

    const animate = () => {
      const elapsedTime = clock.getElapsedTime();

      // Slow, smooth spinning 3D Star & Sphere rotations
      mainGroup.rotation.y = elapsedTime * 0.12;
      mainGroup.rotation.x = Math.sin(elapsedTime * 0.08) * 0.1;

      starGroup.rotation.y = elapsedTime * 0.15;
      starGroup.rotation.z = Math.sin(elapsedTime * 0.1) * 0.15;

      innerStarLines.rotation.y = -elapsedTime * 0.18;
      innerStarLines.rotation.x = elapsedTime * 0.12;

      bgPoints.rotation.y = elapsedTime * 0.04;

      // Gentle organic breathing pulse
      const pulseScale = 1 + Math.sin(elapsedTime * 0.6) * 0.035;
      mainGroup.scale.set(pulseScale, pulseScale, pulseScale);

      // Fast Responsive Mouse Parallax Lerp
      targetRotationY += (mouseX - targetRotationY) * 0.2;
      targetRotationX += (mouseY - targetRotationX) * 0.2;

      mainGroup.rotation.y += targetRotationY;
      mainGroup.rotation.x += targetRotationX;

      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    // ── 7. Clean up ──────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);

      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }

      // Dispose Geometries and Materials
      sphereGeo.dispose();
      pointsMat.dispose();
      wireMat.dispose();
      starGeo.dispose();
      starEdges.dispose();
      starLineMat.dispose();
      starPointsMat.dispose();
      innerStarGeo.dispose();
      innerStarEdges.dispose();
      innerStarLineMat.dispose();
      bgGeo.dispose();
      bgMat.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-hidden"
    />
  );
}
