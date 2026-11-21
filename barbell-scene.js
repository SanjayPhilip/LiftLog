const cover = document.querySelector('.landing-cover');
const canvas = cover.querySelector('canvas');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let started = false;
let draw;

async function buildBarbell() {
  const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.min.js');
  const renderer = new THREE.WebGLRenderer({canvas, alpha:true, antialias:true, powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera();
  camera.position.set(0, 0, 9);
  const bar = new THREE.Group();
  scene.add(bar);
  const material = (color, metalness, roughness) => new THREE.MeshStandardMaterial({color,metalness,roughness});
  const steel = material(0xc5c6cc, .55, .32);
  const rubber = material(0x343237, .14, .55);
  const rim = material(0x57545a, .32, .45);
  const crimson = material(0xcd2445, .27, .34);

  function cylinder(x, radius, length, finish) {
    const part = new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,48),finish);
    part.rotation.z = Math.PI / 2;
    part.position.x = x;
    bar.add(part);
  }
  cylinder(0,.068,6.7,steel);
  for (const side of [-1,1]) {
    cylinder(side*2.65,.13,1.4,steel);
    for (const [x,r] of [[2.03,1],[2.29,.97],[2.54,.79]]) {
      cylinder(side*x,r,.22,rubber);
      cylinder(side*(x+.09),r,.035,rim);
    }
    cylinder(side*2.77,.31,.19,crimson);
  }
  scene.add(new THREE.HemisphereLight(0xffeeee,0x766d83,2));
  for (const [color,power,x,y,z] of [[0xffffff,4,1,5,5],[0xfc294f,3,-4,1,-2]]) {
    const light = new THREE.DirectionalLight(color,power);
    light.position.set(x,y,z);
    scene.add(light);
  }

  let tilt = 0, frame = 0;
  draw = () => {
    if (frame || document.hidden || !canvas.clientWidth || !canvas.clientHeight) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height) return;
      const aspect = width / height;
      const halfHeight = Math.max(1.65,3.45/aspect);
      Object.assign(camera,{left:-halfHeight*aspect,right:halfHeight*aspect,top:halfHeight,bottom:-halfHeight});
      camera.updateProjectionMatrix();
      bar.rotation.set(.13,-.43+(reducedMotion.matches ? 0 : tilt),.26);
      renderer.setSize(width,height,false);
      renderer.render(scene,camera);
      cover.classList.add('has-barbell');
    });
  };
  cover.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || reducedMotion.matches) return;
    const box = cover.getBoundingClientRect();
    tilt = ((event.clientX-box.left)/box.width-.5)*.4;
    draw();
  });
  cover.addEventListener('pointerleave', () => {tilt=0;draw();});
  reducedMotion.addEventListener('change',draw);
  canvas.addEventListener('webglcontextlost',() => cover.classList.remove('has-barbell'));
  new ResizeObserver(draw).observe(canvas);
  draw();
}

new IntersectionObserver(([entry]) => {
  if (!entry.isIntersecting) return;
  if (!started) {
    started = true;
    buildBarbell().catch(() => cover.classList.remove('has-barbell'));
  } else draw?.();
}).observe(cover);
