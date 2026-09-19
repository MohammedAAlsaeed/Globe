"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { GlobeSettings } from "../domain/types";
export function GlobePreview({
  url,
  globe: s,
}: {
  url: string;
  globe: GlobeSettings;
}) {
  const host = useRef<HTMLDivElement>(null),
    [failed, setFailed] = useState(false),
    [seams, setSeams] = useState(true),
    { t } = useTranslation();
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      queueMicrotask(() => setFailed(true));
      return;
    }
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(36, 1, 0.1, 2000);
    const radius = Math.max(1, s.height / s.width);
    camera.position.set(0, 0.3 * radius, 4.2 * radius);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const group = new THREE.Group();
    group.scale.y = s.height / s.width;
    scene.add(group);
    const texture = new THREE.TextureLoader().load(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const geometry = new THREE.SphereGeometry(1, 128, 96),
      material = new THREE.MeshBasicMaterial({ map: texture, color: 0xffffff });
    group.add(new THREE.Mesh(geometry, material));
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x967547,
      transparent: true,
      opacity: 0.8,
    });
    const lines: THREE.BufferGeometry[] = [];
    if (seams)
      for (let n = 0; n < s.gores; n++) {
        const phi = (n / s.gores + s.offset / 360) * Math.PI * 2,
          points = [];
        for (let i = 0; i <= 128; i++) {
          const theta = (i / 128) * Math.PI;
          points.push(
            new THREE.Vector3(
              -1.002 * Math.cos(phi) * Math.sin(theta),
              1.002 * Math.cos(theta),
              1.002 * Math.sin(phi) * Math.sin(theta),
            ),
          );
        }
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        lines.push(geo);
        group.add(new THREE.Line(geo, lineMaterial));
      }
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 2 * radius;
    controls.maxDistance = 9 * radius;
    controls.target.set(0, 0, 0);
    let frame = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    const observer = new ResizeObserver(() => {
      const width = el.clientWidth,
        height = el.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    observer.observe(el);
    animate();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      texture.dispose();
      geometry.dispose();
      material.dispose();
      lineMaterial.dispose();
      lines.forEach((g) => g.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [url, s.width, s.height, s.gores, s.offset, seams]);
  return (
    <div className="globe-preview">
      <div
        ref={host}
        className="globe-canvas"
        role="img"
        aria-label={t("globe3d")}
      />
      {failed && <p className="notice warning">{t("webglError")}</p>}
      <div className="globe-caption">
        <span>{t("globeHelp")}</span>
        <label>
          <input
            type="checkbox"
            checked={seams}
            onChange={(e) => setSeams(e.target.checked)}
          />
          {t("seams")}
        </label>
      </div>
    </div>
  );
}
