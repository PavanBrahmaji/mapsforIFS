// globe.component.ts
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three-orbitcontrols-ts';

@Component({
  selector: 'app-globe',
  templateUrl: './globe.component.html',
  styleUrls: ['./globe.component.css']
})
export class GlobeComponent implements OnInit, OnDestroy {
  @ViewChild('globeContainer', { static: true }) globeContainer!: ElementRef;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private globe!: THREE.Group;
  private animationId!: number;
  private clock = new THREE.Clock();
  
  // Public properties for template binding
  public autoRotate = true;
  public loading = true;
  public loadingProgress = 0;

  private readonly EARTH_RADIUS = 5;
  private textureLoader = new THREE.TextureLoader();
  private earthTextures = {
    map: null as THREE.Texture | null,
    bumpMap: null as THREE.Texture | null,
    specularMap: null as THREE.Texture | null,
    clouds: null as THREE.Texture | null
  };

  ngOnInit(): void {
    this.loadTextures().then(() => {
      this.initThreeJS();
      this.createGlobe();
      this.animate();
      this.loading = false;
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animationId);
    this.renderer.dispose();
    this.globeContainer.nativeElement.removeChild(this.renderer.domElement);
    
    // Dispose textures
    Object.values(this.earthTextures).forEach(texture => {
      if (texture) texture.dispose();
    });
  }

 private async loadTextures(): Promise<void> {
  const texturePromises = [
    this.loadTexture('images/earth.jpg', 'map'),
    // this.loadTexture('images/nightmap.jpg', 'bumpMap'),
    // this.loadTexture('assets/textures/earth-specular.jpg', 'specularMap'),
    // this.loadTexture('images/clouds.jpg', 'clouds')
  ];

  await Promise.all(texturePromises);
}

  private loadTexture(path: string, key: keyof typeof this.earthTextures): Promise<void> {
    return new Promise((resolve) => {
      this.textureLoader.load(
        path,
        (texture) => {
          this.earthTextures[key] = texture;
          this.loadingProgress += 25;
          resolve();
        },
        undefined,
        (error) => {
          console.error('Error loading texture:', error);
          resolve();
        }
      );
    });
  }

  private initThreeJS(): void {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    // Camera
    const width = this.globeContainer.nativeElement.clientWidth;
    const height = this.globeContainer.nativeElement.clientHeight;
    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    this.camera.position.z = this.EARTH_RADIUS * 2.5;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.globeContainer.nativeElement.appendChild(this.renderer.domElement);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.autoRotate = this.autoRotate;
    this.controls.autoRotateSpeed = 0.5;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = this.EARTH_RADIUS * 1.5;
    this.controls.maxDistance = this.EARTH_RADIUS * 5;

    // Handle window resize
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  private createGlobe(): void {
    this.globe = new THREE.Group();
    this.scene.add(this.globe);

    // Earth geometry
    const geometry = new THREE.SphereGeometry(this.EARTH_RADIUS, 64, 64);

    // Earth material with textures
    const earthMaterial = new THREE.MeshPhongMaterial({
      map: this.earthTextures.map || undefined,
      bumpMap: this.earthTextures.bumpMap || undefined,
      bumpScale: 0.05,
      specularMap: this.earthTextures.specularMap || undefined,
      specular: new THREE.Color('grey'),
      shininess: 5
    });

    // Earth mesh
    const earth = new THREE.Mesh(geometry, earthMaterial);
    this.globe.add(earth);

    // Clouds layer (if texture loaded)
    if (this.earthTextures.clouds) {
      const cloudsGeometry = new THREE.SphereGeometry(this.EARTH_RADIUS * 1.005, 64, 64);
      const cloudsMaterial = new THREE.MeshPhongMaterial({
        map: this.earthTextures.clouds,
        transparent: true,
        opacity: 0.4,
        depthWrite: false
      });
      const clouds = new THREE.Mesh(cloudsGeometry, cloudsMaterial);
      this.globe.add(clouds);
    }

    // Atmosphere effect
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(this.EARTH_RADIUS * 1.1, 64, 64),
      new THREE.MeshPhongMaterial({
        color: 0x5599ff,
        transparent: true,
        opacity: 0.2,
        specular: 0x111111,
        shininess: 5,
      })
    );
    this.globe.add(atmosphere);

    // Add lights
    const ambientLight = new THREE.AmbientLight(0x404040);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 3, 5);
    this.scene.add(directionalLight);

    // Add stars background
    this.createStarfield();
  }

  private createStarfield(): void {
    const starGeometry = new THREE.BufferGeometry();
    const starMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.1,
    });

    const starVertices = [];
    for (let i = 0; i < 10000; i++) {
      const x = (Math.random() - 0.5) * 2000;
      const y = (Math.random() - 0.5) * 2000;
      const z = (Math.random() - 0.5) * 2000;
      starVertices.push(x, y, z);
    }

    starGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(starVertices, 3)
    );

    const stars = new THREE.Points(starGeometry, starMaterial);
    this.scene.add(stars);
  }

  private animate(): void {
    this.animationId = requestAnimationFrame(() => this.animate());
    
    const delta = this.clock.getDelta();
    
    // Rotate clouds if they exist
    const clouds = this.globe.children.find(child => 
      child instanceof THREE.Mesh && 
      child.material instanceof THREE.MeshPhongMaterial && 
      child.material.transparent
    );
    
    if (clouds) {
      clouds.rotation.y += 0.0005 * delta * 60;
    }
    
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private onWindowResize(): void {
    const width = this.globeContainer.nativeElement.clientWidth;
    const height = this.globeContainer.nativeElement.clientHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public toggleAutoRotation(): void {
    this.autoRotate = !this.autoRotate;
    this.controls.autoRotate = this.autoRotate;
  }

  public flyTo(lat: number, lng: number): void {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);
    
    const x = -this.EARTH_RADIUS * Math.sin(phi) * Math.cos(theta);
    const y = this.EARTH_RADIUS * Math.cos(phi);
    const z = this.EARTH_RADIUS * Math.sin(phi) * Math.sin(theta);
    
    const wasAutoRotating = this.controls.autoRotate;
    this.controls.autoRotate = false;
    
    const targetPosition = new THREE.Vector3(
      x * 1.5,
      y * 1.5,
      z * 1.5
    );
    
    const duration = 2000;
    const startTime = Date.now();
    
    const animateCamera = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const t = 1 - Math.pow(1 - progress, 3);
      
      this.camera.position.lerpVectors(
        this.camera.position,
        targetPosition,
        t
      );
      
      this.controls.target.set(x * 0.2, y * 0.2, z * 0.2);
      
      if (progress < 1) {
        requestAnimationFrame(animateCamera);
      } else {
        this.controls.autoRotate = wasAutoRotating;
      }
    };
    
    animateCamera();
  }
}