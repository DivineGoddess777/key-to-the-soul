import * as THREE from 'three';
import { SVGLoader } from 'three/addons/SVGLoader.js';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';

const stage = document.querySelector('#stage');
const status = document.querySelector('#status');
const motion = document.querySelector('#motion');
const depth = document.querySelector('#depth');
const art = document.querySelector('#art-toggle');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const viewMode=new URLSearchParams(location.search);
if(viewMode.has('embed'))document.body.classList.add('embed');
if(viewMode.has('hero'))document.body.classList.add('hero');

async function start() {
  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, preserveDrawingBuffer:true, powerPreference:'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio,viewMode.has('hero')?1.25:1.75));
  renderer.setClearColor(0x17120f,0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  stage.append(renderer.domElement);
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('role','img');
  renderer.domElement.setAttribute('aria-label','Three-dimensional Ember Seal. Drag or use arrow keys to turn it.');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(39,1,.1,100);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room,.05);
  scene.environment = environment.texture;
  room.dispose(); pmrem.dispose();
  const front = new THREE.MeshPhysicalMaterial({color:0xc18b60,metalness:.94,roughness:.26,clearcoat:.6,clearcoatRoughness:.22,envMapIntensity:1.6});
  const sides = new THREE.MeshPhysicalMaterial({color:0x744427,metalness:.9,roughness:.33,clearcoat:.35,envMapIntensity:1.2});
  const wire = new THREE.MeshPhysicalMaterial({color:0xbb8257,metalness:.93,roughness:.25,clearcoat:.4,envMapIntensity:1.7});
  for (const [color,intensity,position] of [[0xffeed3,3.5,[-4,5,8]],[0xd59663,3,[5,-1,-3]],[0xf4e9dc,1.6,[4,3,5]]]) {
    const light = new THREE.DirectionalLight(color,intensity);light.position.set(...position);scene.add(light);
  }
  const rig = new THREE.Group();
  const sculpture = new THREE.Group();sculpture.scale.set(.026,-.026,.026);rig.add(sculpture);scene.add(rig);
  const response = await fetch('logos/sacred-flame.svg');
  if (!response.ok) throw Error('Seal source unavailable');
  const data = new SVGLoader().parse(await response.text());
  const moons = [];
  let meshes = 0;
  for (const path of data.paths) {
    const style = path.userData.style;
    const points = path.subPaths.flatMap(part=>part.getPoints(18));
    if (!points.length) continue;
    const box = new THREE.Box2().setFromPoints(points),center=box.getCenter(new THREE.Vector2()),size=box.getSize(new THREE.Vector2());
    const distance=center.distanceTo(new THREE.Vector2(160,160));
    const moon=distance>110 && Math.max(size.x,size.y)>12;
    const middle=distance<95 && Math.max(size.x,size.y)<170;
    const z=moon?1:middle?16:-7;
    const component=new THREE.Group();component.position.set(-160,-160,z);sculpture.add(component);
    if(style.fill && style.fill!=='none') for(const shape of path.toShapes()) {
      const geometry=new THREE.ExtrudeGeometry(shape,{depth:moon?5:9,bevelEnabled:true,bevelSegments:4,steps:1,bevelSize:moon?.7:1.3,bevelThickness:moon?.8:1.5,curveSegments:28});
      component.add(new THREE.Mesh(geometry,[front,sides]));meshes++;
    }
    if(style.stroke && style.stroke!=='none' && (!style.fill || style.fill==='none')) for(const part of path.subPaths) {
      const curve=new THREE.CurvePath();
      for(const segment of part.curves) {
        class Segment3 extends THREE.Curve {getPoint(t,target=new THREE.Vector3()){const p=segment.getPoint(t);return target.set(p.x,p.y,2);}}
        curve.add(new Segment3());
      }
      if(!curve.curves.length || curve.getLength()<.001)continue;
      const radius=Math.max(.38,Number(style.strokeWidth||1)*(middle?.76:.58));
      const geometry=new THREE.TubeGeometry(curve,Math.max(8,Math.min(200,Math.ceil(curve.getLength()*1.1))),radius,8,part.autoClose);
      component.add(new THREE.Mesh(geometry,wire));meshes++;
    }
    if(moon)moons.push({component,z,offset:Math.atan2(center.y-160,center.x-160)});
  }
  if(!meshes)throw Error('Empty sculpture');
  let paused=reduced.matches,visible=true,time=0,previous=performance.now(),yaw=-.23,pitch=.1,currentYaw=yaw,currentPitch=pitch,drag=null,deep=false,frame=0,artMode=false;
  function requestRender(){if(!frame && visible && !document.hidden && !artMode)frame=requestAnimationFrame(render);}
  function render(now){
    frame=0;if(!visible||document.hidden||artMode)return;
    const dt=Math.min((now-previous)/1000,.05);previous=now;if(!paused)time+=dt;
    const smooth=1-Math.exp(-dt*9);currentYaw+=(yaw-currentYaw)*smooth;currentPitch+=(pitch-currentPitch)*smooth;
    rig.rotation.y=currentYaw+(paused?0:Math.sin(time*.42)*.07);rig.rotation.x=currentPitch+(paused?0:Math.sin(time*.3)*.025);rig.position.y=paused?0:Math.sin(time*.75)*.085;
    for(const moon of moons)moon.component.position.z=moon.z+(paused?0:Math.sin(time*.65+moon.offset)*1.8);
    renderer.render(scene,camera);
    if(!paused||Math.abs(yaw-currentYaw)+Math.abs(pitch-currentPitch)>.0005||drag)requestRender();
  }
  function resize(){const {width,height}=stage.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.position.set(0,.05,Math.max(14,12.3/camera.aspect));camera.updateProjectionMatrix();requestRender();}
  const observer=new ResizeObserver(resize);observer.observe(stage);resize();
  const visibility=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){previous=performance.now();requestRender();}});visibility.observe(stage);
  const updateMotion=()=>{motion.textContent=paused?'Resume motion':'Pause motion';motion.setAttribute('aria-pressed',String(paused));};updateMotion();
  function reset(){yaw=-.23;pitch=.1;deep=false;depth.setAttribute('aria-pressed','false');depth.textContent='See the depth';requestRender();}
  renderer.domElement.addEventListener('pointerdown',event=>{if(event.button!==0)return;drag={x:event.clientX,y:event.clientY,yaw,pitch};renderer.domElement.setPointerCapture(event.pointerId);stage.classList.add('dragging');requestRender();});
  renderer.domElement.addEventListener('pointermove',event=>{if(!drag)return;yaw=THREE.MathUtils.clamp(drag.yaw+(event.clientX-drag.x)*.007,-1.25,1.25);pitch=THREE.MathUtils.clamp(drag.pitch+(event.clientY-drag.y)*.005,-.75,.75);requestRender();});
  const end=()=>{drag=null;stage.classList.remove('dragging');requestRender();};
  for(const event of ['pointerup','pointercancel','lostpointercapture'])renderer.domElement.addEventListener(event,end);
  renderer.domElement.addEventListener('dblclick',reset);
  renderer.domElement.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(event.key))return;event.preventDefault();if(event.key==='Home')reset();if(event.key==='ArrowLeft')yaw=Math.max(-1.25,yaw-.12);if(event.key==='ArrowRight')yaw=Math.min(1.25,yaw+.12);if(event.key==='ArrowUp')pitch=Math.max(-.75,pitch-.1);if(event.key==='ArrowDown')pitch=Math.min(.75,pitch+.1);requestRender();});
  motion.addEventListener('click',()=>{paused=!paused;updateMotion();requestRender();});
  reduced.addEventListener('change',()=>{paused=reduced.matches;updateMotion();requestRender();});
  addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='ktts-motion'||typeof event.data.paused!=='boolean')return;
    paused=event.data.paused;updateMotion();requestRender();
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&parent!==window)parent.postMessage({type:'ktts-close-seal'},location.origin);});
  depth.addEventListener('click',()=>{deep=!deep;yaw=deep?.93:-.23;pitch=deep?-.16:.1;depth.setAttribute('aria-pressed',String(deep));depth.textContent=deep?'Front view':'See the depth';requestRender();});
  document.querySelector('#reset').addEventListener('click',reset);
  const finishes={gold:[0xe5c7a0,0xa96947,0xd7b487],copper:[0xc18b60,0x744427,0xbb8257],champagne:[0xe9dcc5,0x9c7c59,0xe1cda9]};
  document.querySelectorAll('[data-finish]').forEach(button=>button.addEventListener('click',()=>{const palette=finishes[button.dataset.finish];front.color.setHex(palette[0]);sides.color.setHex(palette[1]);wire.color.setHex(palette[2]);document.querySelectorAll('[data-finish]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));requestRender();}));
  art.addEventListener('click',()=>{artMode=!artMode;document.body.classList.toggle('art-mode',artMode);art.setAttribute('aria-pressed',String(artMode));art.textContent=artMode?'Return to interactive 3D':'View sculpted artwork';document.querySelectorAll('.controls button,[data-finish]').forEach(button=>button.disabled=artMode);status.textContent=artMode?'Sculpted artwork study · still image':'Sculpted metal. Floating moons. Turn it to catch the light.';if(!artMode){previous=performance.now();requestRender();}});
  document.querySelector('#save').addEventListener('click',()=>{renderer.render(scene,camera);renderer.domElement.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='key-to-the-soul-ember-seal-3d.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);});});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){previous=performance.now();requestRender();}});
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();visible=false;cancelAnimationFrame(frame);document.body.classList.remove('ready');renderer.domElement.style.display='none';document.querySelectorAll('button').forEach(button=>button.disabled=true);status.textContent='Sculpted artwork shown. Reload to restart interactive 3D.';});
  addEventListener('pagehide',()=>{cancelAnimationFrame(frame);observer.disconnect();visibility.disconnect();sculpture.traverse(item=>item.geometry?.dispose());front.dispose();sides.dispose();wire.dispose();environment.dispose();renderer.dispose();},{once:true});
  if(parent!==window)parent.postMessage({type:'ktts-seal-ready'},location.origin);
  document.body.classList.add('ready');document.querySelectorAll('button').forEach(button=>button.disabled=false);status.textContent='Sculpted metal. Floating moons. Turn it to catch the light.';requestRender();
}
start().catch(error=>{console.error('Ember Seal viewer:',error);document.body.classList.remove('ready');stage.querySelector('canvas')?.remove();status.textContent='Sculpted artwork shown. Interactive 3D is unavailable in this browser.';document.querySelectorAll('button').forEach(button=>button.disabled=true);});
