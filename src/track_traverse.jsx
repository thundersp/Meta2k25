// Import necessary libraries
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import * as CANNON from "cannon-es";

// Button to log ball coordinates
const logCoordsButton = document.getElementById("logBallCoords");

// Function to log the ball's current coordinates
function logBallCoordinates() {
  const ballPosition = ballBody.position;
  console.log(
    `Ball Coordinates: X: ${ballPosition.x.toFixed(
      2
    )}, Y: ${ballPosition.y.toFixed(2)}, Z: ${ballPosition.z.toFixed(2)}`
  );
}

// Add an event listener to the button
logCoordsButton.addEventListener("click", logBallCoordinates);

// Three.js and Cannon.js setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.2,
  1000
);
const renderer = new THREE.WebGLRenderer();

renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

camera.position.set(16, 22, -26);
camera.lookAt(0, 0, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // Adds smooth motion to mouse controls
controls.dampingFactor = 0.1;
controls.minDistance = 5; // Minimum zoom distance
controls.maxDistance = 100; // Maximum zoom distance
controls.enableRotate = true; // Enable camera rotation
controls.enablePan = true; // Allow panning
controls.enableZoom = true; // Enable zoom

const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 10;

// Track material
const trackMaterial = new CANNON.Material("trackMaterial");

// Ball material
const ballMaterial = new CANNON.Material("ballMaterial");
const ballContactMaterial = new CANNON.ContactMaterial(
  trackMaterial,
  ballMaterial,
  {
    friction: 10,
    restitution: 0,
  }
);
world.addContactMaterial(ballContactMaterial);

// Ball setup
const ballGeometry = new THREE.SphereGeometry(0.5, 32, 32);
const ballMaterialThree = new THREE.MeshStandardMaterial({ color: 0x0077ff }); // White color
const ballMesh = new THREE.Mesh(ballGeometry, ballMaterialThree);
scene.add(ballMesh);

const ballBody = new CANNON.Body({
  mass: 20,
  material: ballMaterial,
  shape: new CANNON.Sphere(0.5),
});
ballBody.position.set(0, 15, 0);
world.addBody(ballBody);

// Light setup
const light = new THREE.DirectionalLight(0xffffff, 1, 100);
light.position.set(10, 10, 10);
scene.add(light);

// Adding a global light (ambient light)
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // Soft white light
scene.add(ambientLight);

// Load track and debug slopes
const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

// Load the texture for the model (image stored in the public folder)
const texture = textureLoader.load("/space.jpg"); // Path to your texture file in the public folder

const config = {
  trackModelPath: "/models/untitled.glb",
  trackPositions: {},
  trackRotations: {},
};

// Debugging Function: Add Normals Visualization
function addNormals(mesh) {
  const vertices = mesh.geometry.attributes.position.array;
  const normals = mesh.geometry.attributes.normal.array;
  const lines = [];

  for (let i = 0; i < vertices.length; i += 3) {
    const start = new THREE.Vector3(
      vertices[i],
      vertices[i + 1],
      vertices[i + 2]
    );
    const direction = new THREE.Vector3(
      normals[i],
      normals[i + 1],
      normals[i + 2]
    );

    const end = new THREE.Vector3().addVectors(
      start,
      direction.clone().multiplyScalar(0.1)
    ); // Scale normal length
    lines.push(start, end);
  }

  const lineGeometry = new THREE.BufferGeometry().setFromPoints(lines);

  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0x000000, // Black or any color (doesn't matter if rendering is disabled)
    visible: false, // Disable visibility entirely
  });

  const lineSegments = new THREE.LineSegments(lineGeometry, lineMaterial);

  // Ensure it's not rendered
  lineSegments.visible = false;

  mesh.add(lineSegments);
}

loader.load(config.trackModelPath || "/models/untitled.glb", (gltf) => {
  const track = gltf.scene;
  scene.add(track);

  track.traverse((child) => {
    if (child.isMesh) {
      // Ensure the original material and texture are preserved
      if (child.material && child.material.map) {
        // Retain the original texture
        child.material.map.needsUpdate = true;
      } else if (child.material) {
        // Preserve original material properties
        child.material.needsUpdate = true;
      }

      // Cannon.js collision shape creation
      const geometry = child.geometry.clone();
      geometry.applyMatrix4(child.matrixWorld);

      const vertices = Array.from(geometry.attributes.position.array);
      const indices = Array.from(geometry.index.array);

      const shape = new CANNON.Trimesh(vertices, indices);

      const body = new CANNON.Body({
        mass: 0,
        material: trackMaterial,
      });
      body.addShape(shape);

      const position = config.trackPositions?.[child.name] || {
        x: 0,
        y: 0,
        z: 0,
      };
      const rotation = config.trackRotations?.[child.name] || {
        x: 0,
        y: 0,
        z: 0,
      };
      body.position.set(position.x, position.y, position.z);
      body.quaternion.setFromEuler(rotation.x, rotation.y, rotation.z);

      world.addBody(body);

      // Optionally add normals for better rendering
      addNormals(child);
    }
  });

  console.log(
    "Model loaded successfully with its original materials and textures!"
  );
});

// WSAD Controls for Ball Movement
let keyState = {};
window.addEventListener("keydown", (event) => {
  keyState[event.code] = true;
});
window.addEventListener("keyup", (event) => {
  keyState[event.code] = false;
});

// Function to handle ball movement
function handleBallMovement() {
  const speed = 0.1;

  if (keyState["KeyS"]) ballBody.velocity.z -= speed;
  if (keyState["KeyW"]) ballBody.velocity.z += speed;
  if (keyState["KeyD"]) ballBody.velocity.x -= speed;
  if (keyState["KeyA"]) ballBody.velocity.x += speed;
}

// Animation loop
let animationId;
function animate() {
  if (gameFinished) return; // Stop the simulation if the game is finished

  animationId = requestAnimationFrame(animate);

  // Check if the ball has reached the end point
  const ballPosition = ballBody.position;
  if (
    Math.abs(ballPosition.x - endPoint.x) < 1 &&
    Math.abs(ballPosition.y - endPoint.y) < 1 &&
    Math.abs(ballPosition.z - endPoint.z) < 1
  ) {
    stopSimulation(); // Stop the simulation
    showPassCard(); // Show "You Pass" card
    return;
  }

  // Check if the ball has fallen off the map
  checkBallFallOff();

  // Update physics world
  world.step(1 / 60);

  // Handle ball movement
  handleBallMovement();

  // Update ball mesh with physics updates
  ballMesh.position.copy(ballBody.position);
  ballMesh.quaternion.copy(ballBody.quaternion);

  // Camera follows the ball
  const cameraYOffset = 15; // Fixed height for the camera
  const cameraZOffset = -8; // Fixed distance behind the ball in Z-direction
  camera.position.x = ballBody.position.x + 6;
  camera.position.y = cameraYOffset;
  camera.position.z = ballBody.position.z + cameraZOffset;
  camera.lookAt(ballBody.position.x, ballBody.position.y, ballBody.position.z);

  // Render the scene
  renderer.render(scene, camera);
}

animate();

// Handle Window Resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

export default Model;
