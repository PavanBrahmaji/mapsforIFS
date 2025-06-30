// globe.component.ts
import { Component, ElementRef, EventEmitter, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three-orbitcontrols-ts';

@Component({
  selector: 'app-globe',
  templateUrl: './globe.component.html',
  styleUrls: ['./globe.component.css']
})
export class GlobeComponent implements OnInit, OnDestroy {
  @ViewChild('globeContainer', { static: true }) globeContainer!: ElementRef;

  // ...rest of your code...

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
      this.loadTexture('images/earth5.jpg', 'map')
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

    // Renderer - NO shadow map enabled
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.globeContainer.nativeElement.appendChild(this.renderer.domElement);

    // Controls (mouse controls disabled)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableZoom = false;
    this.controls.enableRotate = false;
    this.controls.enablePan = false;
    this.controls.autoRotate = this.autoRotate;
    this.controls.autoRotateSpeed = 0.15; // Decreased from 0.5 for slower rotation
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

    // Earth material - Use MeshBasicMaterial for zero lighting influence
    const earthMaterial = new THREE.MeshBasicMaterial({
      map: this.earthTextures.map || undefined,
      // MeshBasicMaterial ignores all lighting for perfectly uniform appearance
    });

    // Earth mesh - NO shadow casting/receiving
    const earth = new THREE.Mesh(geometry, earthMaterial);
    this.globe.add(earth);

    // Clouds layer (if texture loaded) - NO shadow properties
    if (this.earthTextures.clouds) {
      const cloudsGeometry = new THREE.SphereGeometry(this.EARTH_RADIUS * 1.005, 64, 64);
      // Clouds material - Use MeshBasicMaterial for uniform lighting
      const cloudsMaterial = new THREE.MeshBasicMaterial({
        map: this.earthTextures.clouds,
        transparent: true,
        opacity: 0.4,
        depthWrite: false
        // MeshBasicMaterial ensures clouds are uniformly lit
      });
      const clouds = new THREE.Mesh(cloudsGeometry, cloudsMaterial);
      this.globe.add(clouds);
    }

    // Atmosphere effect - Use MeshBasicMaterial for uniform color
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(this.EARTH_RADIUS * 1.1, 64, 64),
      new THREE.MeshBasicMaterial({
        color: 0x5599ff,
        transparent: true,
        opacity: 0.2,
        // MeshBasicMaterial ensures uniform blue atmosphere color
      })
    );
    this.globe.add(atmosphere);

    // Add lights - NO shadow casting
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
      child.material instanceof THREE.MeshBasicMaterial && 
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

  public startAutoRotation(): void {
    this.autoRotate = true;
    if (this.controls) {
      this.controls.autoRotate = true;
      this.controls.update();
    }
    // Removed static camera reset marks:
    // this.camera.position.set(0, 0, this.EARTH_RADIUS * 2.5);
    // this.controls.target.set(0, 0, 0);
  }

  // In globe.component.ts
public flyTo(lat: number, lng: number, onComplete?: () => void): void {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);

    const x = -this.EARTH_RADIUS * Math.sin(phi) * Math.cos(theta);
    const y = this.EARTH_RADIUS * Math.cos(phi);
    const z = this.EARTH_RADIUS * Math.sin(phi) * Math.sin(theta);

    // Stop rotation immediately
    this.controls.autoRotate = false;
    this.autoRotate = false;

    // Always keep the axis at the center
    this.controls.target.set(0, 0, 0);

    // Step 1: Move to the direction of the target, keeping current distance
    const currentDistance = this.camera.position.length();
    const startDirection = this.camera.position.clone().normalize();
    const endDirection = new THREE.Vector3(x, y, z).normalize();
    const moveTargetPosition = endDirection.clone().multiplyScalar(currentDistance);

    // Step 2: Zoom in much closer to the target distance for a "dive in" effect
    const zoomTargetPosition = endDirection.clone().multiplyScalar(this.EARTH_RADIUS * 0.6);

    const moveDuration = 2500; // ms (slower for more drama)
    const zoomDuration = 2000; // ms

    function easeInOutCubic(t: number): number {
      return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    // Step 1: Move to the target direction
    const moveStart = this.camera.position.clone();
    const moveEnd = moveTargetPosition.clone();
    const moveStartTime = Date.now();

    const moveToDirection = () => {
      const elapsed = Date.now() - moveStartTime;
      const progress = Math.min(elapsed / moveDuration, 1);
      const t = easeInOutCubic(progress);

      // Interpolate direction at constant distance
      const currentDir = startDirection.clone().lerp(endDirection, t).normalize();
      const currentPos = currentDir.multiplyScalar(currentDistance);
      this.camera.position.copy(currentPos);

      this.controls.target.set(0, 0, 0);

      if (progress < 1) {
        requestAnimationFrame(moveToDirection);
      } else {
        // Step 2: Zoom in to the location
        const zoomStart = this.camera.position.clone();
        const zoomEnd = zoomTargetPosition.clone();
        const zoomStartTime = Date.now();

        let zoomDistance = currentDistance;
        const minDistance = 0; // Allow camera to go to the center of the globe

        const zoomIn = () => {
          const elapsedZoom = Date.now() - zoomStartTime;
          const progressZoom = Math.min(elapsedZoom / zoomDuration, 1);
          const tZoom = easeInOutCubic(progressZoom);

          // Interpolate distance along the same direction
          zoomDistance -= 0.05; // Speed of zoom-in, decrease for slower
          if (zoomDistance < minDistance) zoomDistance = minDistance;

          const zoomPos = endDirection.clone().multiplyScalar(zoomDistance);
          this.camera.position.copy(zoomPos);
          this.controls.target.set(0, 0, 0);

          if (progressZoom < 1) {
            requestAnimationFrame(zoomIn);
          } else {
            this.camera.position.copy(zoomEnd);
            this.controls.target.set(0, 0, 0);
            this.controls.autoRotate = false;
            this.autoRotate = false;
            
            // Call the completion callback if provided
            if (onComplete) {
              onComplete();
            }
          }
        };
        zoomIn();
      }
    };

    moveToDirection();
}
}