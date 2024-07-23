import { Camera, Plane, Raycaster, Vector2, Vector3, WebGLRenderer } from "three";
import { uniform } from "three/examples/jsm/nodes/Nodes.js";
import WebGPURenderer from "three/examples/jsm/renderers/webgpu/WebGPURenderer.js";

export class Pointer {

    camera:Camera;
    renderer:WebGLRenderer|WebGPURenderer;
    rayCaster: Raycaster = new Raycaster();
    iPlane: Plane = new Plane(new Vector3(0, 0, 1));
    pointer: Vector2 = new Vector2();
    scenePointer: Vector3 = new Vector3();
    pointerDown: boolean = false;
    uPointerDown = uniform(0);
    uPointer = uniform(new Vector3());

    constructor(renderer:WebGLRenderer|WebGPURenderer, camera: Camera) {

        this.camera = camera;
        this.renderer = renderer;

        renderer.domElement.addEventListener("pointerdown", this.onPointerDown.bind(this));
        renderer.domElement.addEventListener("pointerup", this.onPointerUp.bind(this));
        window.addEventListener("pointermove", this.onPointerMove.bind(this));
    }

    onPointerDown(e: PointerEvent): void {
        if (e.pointerType !== 'mouse' || e.button === 0) {
            this.pointerDown = true;
            this.uPointerDown.value = 1;
        }
        this.updateScreenPointer(e);
    }
    onPointerUp(e: PointerEvent): void {
        this.updateScreenPointer(e);
        this.pointerDown = false;
        this.uPointerDown.value = 0;

    }
    onPointerMove(e: PointerEvent): void {
        this.updateScreenPointer(e);
    }

    updateScreenPointer(e: PointerEvent): void {
        this.pointer.set(
            (e.clientX / window.innerWidth) * 2 - 1,
            - (e.clientY / window.innerHeight) * 2 + 1
        );
        this.rayCaster.setFromCamera(this.pointer, this.camera);
        this.rayCaster.ray.intersectPlane(this.iPlane, this.scenePointer);
        this.uPointer.value.x = this.scenePointer.x;
        this.uPointer.value.y = this.scenePointer.y;
        this.uPointer.value.z = this.scenePointer.z;
        //console.log( this.scenePointer );
    }
}