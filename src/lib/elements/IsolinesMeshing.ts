
// @ts-nocheck
// cutting the Typescript linting for this file, as it seems a bit too strict for the TSL code
import { IAnimatedElement } from "../interfaces/IAnimatedElement";
import { WebGPURenderer, BufferGeometry, DirectionalLight, DirectionalLightShadow, EquirectangularReflectionMapping,Group, Mesh, PerspectiveCamera, Plane, Scene, Vector3, Vector4, StorageBufferAttribute } from "three/webgpu";
import GUI from "three/examples/jsm/libs/lil-gui.module.min.js";
import { Root } from "../Root";
import { loop, color, float, If, instanceIndex, max, MeshStandardNodeMaterial, min,mx_fractal_noise_float, pow, storage, sub, tslFn, uniform, uniforms, vec3, vec4, cond, int, mix, timerGlobal, positionWorld, mul, oscSine} from "three/webgpu";
import { OrbitControls, UltraHDRLoader } from "three/examples/jsm/Addons.js";
import { Pointer } from "../utils/Pointer";
import { IsolinesMaterial } from "./IsolinesMaterial";
import { Palettes } from "./Palettes";

export class IsolinesMeshing implements IAnimatedElement {
	scene: Scene;
	camera: PerspectiveCamera;
	renderer: WebGPURenderer;
	controls: OrbitControls;
	gui: GUI;
	pointerHandler: Pointer;


	constructor(scene: Scene, camera: PerspectiveCamera, controls: OrbitControls, renderer: WebGPURenderer) {
		this.scene = scene;
		this.camera = camera;
		this.controls = controls;
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.1;
		this.camera.position.set(0, 30, -100);
		this.camera.updateMatrixWorld();
		this.renderer = renderer;
		this.renderer.shadowMap.enabled = true;
		this.pointerHandler = new Pointer(this.renderer, this.camera);
		this.pointerHandler.iPlane = new Plane(new Vector3(0, 1, 0), 0.0);
		this.gui = new GUI();
	}

	async init() {

		this.createLights();
		// this uniform buffer needs to be initialized at the maximum size i'm going to use at first for the rest of palettes to work correctly
		this.layerColors.array = Palettes.getGrayGradient(128).array;
		this.uNbColors.value = this.layerColors.array.length;

		await this.initMesh();
		
		// load the bg / envmap // https://polyhaven.com/a/table_mountain_2_puresky 
		// converted to Adobe Gain Map with https://gainmap-creator.monogrid.com/ 
		const texture = await new UltraHDRLoader().setPath('./assets/ultrahdr/').loadAsync('table_mountain_2_puresky_2k.jpg', (progress) => {
			console.log("Skybox load progress", Math.round(progress.loaded / progress.total * 100) + "%");
		});
		texture.mapping = EquirectangularReflectionMapping;
		this.scene.background = texture;
		this.scene.environment = texture;

		// plug the main animation loop
		Root.registerAnimatedElement(this);

		this.initGUI();

		// palette is set back to default after a few frames , in Root.ts / update 
	}

	uNbColors = uniform(8); // number of colors in the current palette
	layerColors = uniforms([]); // the colors of the palette

	uScrollTimeScale = uniform(1.0); // 
	uScrollSpeedX = uniform(0.0);
	uScrollSpeedY = uniform(-0.01);
	uScrollSpeedZ = uniform(0.01);
	uRotationSpeed = uniform(0.0);
	uNoiseScaleX = uniform(1.0);
	uNoiseScaleZ = uniform(1.0);
	uScrollOffset = uniform(new Vector4(0.0, 0.0, 0.0, 0.0));

	uFrequency = uniform(0.01);
	uOctaves = uniform(4.0);

	useCursor: boolean = false;
	uUseCursor = uniform(0);
	uCursorSize = uniform(20);

	
	tilings = [
		"Triangles",
		"Quads",
	]
	tiling: string = this.tilings[0];
	uTiling = uniform(0.0);
	hideWalls: boolean = false;
	rotatePalette: boolean = false;
	uRotatePalette = uniform(0);
	uPaletteRotSpeed = uniform(1.0);
	uWireFrame = uniform(0);
	useBands: boolean = true;
	uUseBands = uniform(1);

	uRoughness = uniform(0.8);
	uMetalness = uniform(0.1);

	
	palettes = [
		"default",
		"rainbow",
		"shibuya",
		"tutti",
		"earthy",
		"gray",
		"blackWhite",
		"mondrian",
		"pinkBlueMirror"
	];
	palette: string = this.palettes[0];

	infos: string = "Field marked with * are GPU intensive, adjust with that in mind";
	initGUI() {
		const infoFolder = this.gui.addFolder("Info");
		infoFolder.domElement.children[1].append("Field marked with * have an influence on performances, adjust with that in mind");
		
		const noiseFolder = this.gui.addFolder("Noise");
		noiseFolder.add(this.uScrollTimeScale, 'value', 0.0, 5.0).name("Scroll Time Scale");
		noiseFolder.add(this.uScrollSpeedX, 'value', -0.3, 0.3).name("Scroll Speed X");
		noiseFolder.add(this.uScrollSpeedY, 'value', -0.3, 0.3).name("Scroll Speed Y");
		noiseFolder.add(this.uScrollSpeedZ, 'value', -0.3, 0.3).name("Scroll Speed Z");
		noiseFolder.add(this.uRotationSpeed, 'value', -0.3, 0.3).name("Rotation Speed");
		noiseFolder.add(this.uNoiseScaleX, 'value', 0.1, 5.0).name("Noise scale X");
		noiseFolder.add(this.uNoiseScaleZ, 'value', 0.1, 5.0).name("Noise scale Z");
		noiseFolder.add(this.uFrequency, 'value', 0.001, 0.02).name("Noise frequency");
		noiseFolder.add(this.uOctaves, 'value', 1.0, 9.0).name("Noise octaves *");

		const generationFolder = this.gui.addFolder("Generation");
		generationFolder.add(this.uNbLayers, 'value', 4, 128).name("Nb layers *").onChange((v) => {
			if (this.palette === "gray") {
				this.layerColors.array = Palettes.getGrayGradient(v).array;
				this.uNbColors.value = this.layerColors.array.length;
			}
		});
		generationFolder.add(this.uLayerHeight, 'value', 0.01, 5).name("Layer height");
		generationFolder.add(this, 'tiling', this.tilings).name("Tiling").onChange((v) => {
			this.uTiling.value = this.tilings.indexOf(v);
		});

		const aspectFolder = this.gui.addFolder("Aspect");
		aspectFolder.add(this.mainMaterial, 'wireframe').name('Wireframe').onChange((v) => {
			this.sideMaterial.wireframe = v;
			this.uWireFrame.value = v ? 1 : 0;
		});

		aspectFolder.add(this, 'palette', this.palettes).name("Palette").onChange((v) => {
			this.setPalette(v);
		});

		aspectFolder.add(this, 'hideWalls').name("Hide walls *").onChange((v) => {
			this.sideMesh.visible = !v;
		});
		aspectFolder.add(this, 'useBands').name("Dark bands *").onChange((v) => {
			this.uUseBands.value = v ? 1 : 0;
		});

		aspectFolder.add(this.uRoughness, 'value', 0.0, 1.0).name("Roughness");
		aspectFolder.add(this.uMetalness, 'value', 0.0, 1.0).name("Metalness");

		aspectFolder.add(this, 'rotatePalette').name("Rotate palette").onChange((v) => {
			this.uRotatePalette.value = v ? 1 : 0;
		});
		aspectFolder.add(this.uPaletteRotSpeed, 'value', 0.0, 20.0).name("Pal. rotation speed");


		const cursorFolder = this.gui.addFolder("Cursor");
		cursorFolder.add(this, 'useCursor').name("Use cursor").onChange((v) => {
			this.uUseCursor.value = v ? 1 : 0;
		})
		cursorFolder.add(this.uCursorSize, 'value', 1, 100).name("Cursor size");


		document.addEventListener('keydown', (e) => {
			if (e.code === 'Space') {
				if (this.gui._hidden)
					this.gui.show();
				else
					this.gui.hide();
			}
		});
	}

	setPalette(paletteName: string = "default") {
		switch (paletteName) {
			case "default":
				this.layerColors.array = Palettes.defaultColors.array;
				break;
			case "rainbow":
				this.layerColors.array = Palettes.rainbowColors.array;
				break;
			case "shibuya":
				this.layerColors.array = Palettes.shibuyaColor.array;
				break;
			case "tutti":
				this.layerColors.array = Palettes.tuttiColors.array;
				break;
			case "earthy":
				this.layerColors.array = Palettes.earthyColors.array;
				break;
			case "gray":
				this.layerColors.array = Palettes.getGrayGradient(this.uNbLayers.value).array;
				break;
			case "blackWhite":
				this.layerColors.array = Palettes.blackWhite.array;
				break;
			case "mondrian":
				this.layerColors.array = Palettes.mondrian.array;
				break;
			case "pinkBlueMirror":
				this.layerColors.array = Palettes.pinkBlueMirror.array;
				break;
		}
		this.uNbColors.value = this.layerColors.array.length;
	}

	lightGroup: Group = new Group();
	dirLight: DirectionalLight;
	createLights() {

		this.dirLight = new DirectionalLight(0xffffff, 3);
		this.dirLight.position.set(this.gridWidth * .5, this.gridWidth * .5, this.gridWidth * .5).multiplyScalar(this.cellSize);
		this.dirLight.castShadow = true;
		const s: DirectionalLightShadow = this.dirLight.shadow;
		const sCamSize: number = 175;
		s.bias = -0.001;
		s.mapSize.set(4096, 4096);
		s.camera.near = 0;
		s.camera.far = this.gridWidth * this.cellSize * 2;
		s.camera.left = -sCamSize;
		s.camera.right = sCamSize;
		s.camera.top = sCamSize;
		s.camera.bottom = -sCamSize;

		this.lightGroup.add(this.dirLight);
		this.scene.add(this.lightGroup);


	}


	uNbLayers = uniform(32);
	uLayerHeight = uniform(1);
	gridWidth: number = 256;
	cellSize: number = 1;

	nbTris: number = this.gridWidth * this.gridWidth * 2;
	maxSubdiv: number = 60; // the max number of vertices generated per triangle. 60 is fine in most cases, but you can see holes appearing if the sliders are pushed
	nbBaseVertices: number = this.nbTris * 3;
	nbBaseNormals: number = this.nbTris * 3;
	nbBigVertices: number = this.nbTris * this.maxSubdiv;
	nbBigNormals: number = this.nbTris * this.maxSubdiv;
	nbBigColors: number = this.nbTris * this.maxSubdiv;

	nbSideQuads: number = (this.gridWidth - 1) * 4; // a one tile margin to hide the jagged edge of the triangle tiling
	nbSideVertices: number = this.nbSideQuads * 6;

	sbaVertices: StorageBufferAttribute;
	sbaNormals: StorageBufferAttribute;

	sbaBigVertices: StorageBufferAttribute;
	sbaBigNormals: StorageBufferAttribute;
	sbaBigColors: StorageBufferAttribute;

	sbaSideVertices: StorageBufferAttribute;
	sbaSideNormals: StorageBufferAttribute;
	sbaSideColors: StorageBufferAttribute;

	mainMaterial: MeshStandardNodeMaterial;
	sideMaterial: MeshStandardNodeMaterial;
	mainMesh: Mesh;
	sideMesh: Mesh;
	async initMesh() {
		// main mesh
		this.sbaBigVertices = new StorageBufferAttribute(this.nbBigVertices, 4);
		this.sbaBigNormals = new StorageBufferAttribute(this.nbBigNormals, 4);
		this.sbaBigColors = new StorageBufferAttribute(this.nbBigColors, 4);

		const bigGeom: BufferGeometry = new BufferGeometry();
		bigGeom.setAttribute("position", this.sbaBigVertices);
		bigGeom.setAttribute("normal", this.sbaBigNormals);
		bigGeom.setAttribute("color", this.sbaBigColors);

		const isoMat: IsolinesMaterial = new IsolinesMaterial(
			this.gridWidth,
			this.cellSize,
			this.uWireFrame,
			this.uLayerHeight,
			this.uUseBands,
			this.getHeight.bind(this),
			this.uRoughness,
			this.uMetalness
		);
		this.mainMaterial = isoMat;

		const bigMesh: Mesh = new Mesh(bigGeom, isoMat);
		bigMesh.castShadow = true;
		bigMesh.receiveShadow = true;
		bigMesh.frustumCulled = false;
		this.scene.add(bigMesh);
		this.mainMesh = bigMesh;

		////// sides
		// the sides should probably be done in the main compute, with the same treatment 
		// but for now, this is a good enough approximation
		this.sbaSideVertices = new StorageBufferAttribute(this.nbSideVertices, 4);
		this.sbaSideNormals = new StorageBufferAttribute(this.nbSideVertices, 4);

		const sideGeom: BufferGeometry = new BufferGeometry();
		sideGeom.setAttribute("position", this.sbaSideVertices);
		sideGeom.setAttribute("normal", this.sbaSideNormals);

		const sideMat: MeshStandardNodeMaterial = new MeshStandardNodeMaterial();
		sideMat.roughness = 0.8;
		sideMat.metalness = 0.1;
		sideMat.colorNode = this.sideColorNode();
		sideMat.roughnessNode = this.uRoughness;
		sideMat.metalnessNode = this.uMetalness;
		this.sideMaterial = sideMat;
		const sideMesh: Mesh = new Mesh(sideGeom, sideMat);
		sideMesh.castShadow = true;
		sideMesh.receiveShadow = true;
		sideMesh.frustumCulled = false;
		this.scene.add(sideMesh);
		this.sideMesh = sideMesh;

		/*
		// base grid mesh
		this.sbaVertices = new StorageBufferAttribute(this.nbBaseVertices, 4);
		this.sbaNormals = new StorageBufferAttribute(this.nbBaseNormals, 4);
		const testGeom: BufferGeometry = new BufferGeometry();
		testGeom.setAttribute("position", this.sbaVertices);
		testGeom.setAttribute("normal", this.sbaNormals);
		const testMat: MeshStandardNodeMaterial = new MeshStandardNodeMaterial();
		testMat.opacity = 0.1;
		testMat.wireframe = true;
		testMat.transparent = true;
		const testMesh: Mesh = new Mesh(testGeom, testMat);
		testMesh.frustumCulled = false;
		this.scene.add(testMesh);
		*/


		await this.renderer.computeAsync(this.computeTriangles);
		await this.renderer.computeAsync(this.computeSides);
	}

	sideColorNode = tslFn(() => {
		const h = positionWorld.y.div(this.uLayerHeight).floor().add(1);
		return this.getLayerColor(h);
	});


	// runs for all triangles of the grid
	computeTriangles = tslFn(() => {

		const cellIndex = instanceIndex.div(2); // I'm treating them as slanted quads
		// world offset
		const px = cellIndex.remainder(this.gridWidth).toFloat().mul(this.cellSize).sub(float(this.gridWidth).mul(this.cellSize).mul(0.5));
		const pz = cellIndex.div(this.gridWidth).toFloat().mul(this.cellSize).sub(float(this.gridWidth).mul(this.cellSize).mul(0.5));
		const tri = instanceIndex.remainder(2).equal(0); // which side of the quad
		const p0 = vec3(0.0).toVar();
		const p1 = vec3(0.0).toVar();
		const p2 = vec3(0.0).toVar();
		const p3 = vec3(0.0).toVar();

		If(this.uTiling.equal(0), () => {
			// triangle tiling
			const offset = cond(cellIndex.div(this.gridWidth).remainder(2).equal(0), -this.cellSize * .5, 0);
			p0.assign(vec3(px.add(offset), 0, pz));
			p1.assign(vec3(px.add(offset).add(this.cellSize), 0, pz));
			p2.assign(vec3(px.add(offset).add(this.cellSize * .5), 0, pz.add(this.cellSize)));
			p3.assign(vec3(px.add(offset).add(this.cellSize).add(this.cellSize * .5), 0, pz.add(this.cellSize)));
		}).else(() => {
			// normal quad tiling
			p0.assign(vec3(px, 0, pz));
			p1.assign(vec3(px.add(this.cellSize), 0, pz));
			p2.assign(vec3(px, 0, pz.add(this.cellSize)));
			p3.assign(vec3(px.add(this.cellSize), 0, pz.add(this.cellSize)));
		});

		const v0Pos = vec3(0.0).toVar();
		const v1Pos = vec3(0.0).toVar();
		const v2Pos = vec3(0.0).toVar();

		// assign the vertices of the triangle
		If(tri, () => {
			v0Pos.assign(p0);
			v1Pos.assign(p2);
			v2Pos.assign(p1);
		}).else(() => {
			v0Pos.assign(p1);
			v1Pos.assign(p2);
			v2Pos.assign(p3);
		})

		// get height of the vertices
		const h1 = this.getHeight(v0Pos).toVar();
		const h2 = this.getHeight(v1Pos).toVar();
		const h3 = this.getHeight(v2Pos).toVar();
		v0Pos.y.assign(h1);
		v1Pos.y.assign(h2);
		v2Pos.y.assign(h3);

		// get the min and max height of the triangle
		const h_min = min(h1, min(h2, h3)).div(this.uLayerHeight);
		const h_max = max(h1, max(h2, h3)).div(this.uLayerHeight);
		const temp = vec3(0.0).toVar();
		const v1 = vec3(0.0).toVar().assign(v0Pos.xyz);
		const v2 = vec3(0.0).toVar().assign(v1Pos.xyz);
		const v3 = vec3(0.0).toVar().assign(v2Pos.xyz);

		// set where in the buffers are we going to store the vertices for the triangle decomposition
		const startIndex = int(instanceIndex).mul(this.maxSubdiv);

		// our buffers
		const positions = storage(this.sbaBigVertices, 'vec4', this.sbaBigVertices.count);
		const normals = storage(this.sbaBigNormals, 'vec4', this.sbaBigNormals.count);
		const colors = storage(this.sbaBigColors, 'vec4', this.sbaBigColors.count);

		const nn = vec3(0.0).toVar();
		const giMix = float(0.8); // for GI effect, could be a uniform
		const aoMul = float(0.3); // for AO  effect, could be a uniform

		const vIndex = int(startIndex).toVar(); 

		loop({ type: 'uint', start: h_min, end: h_max, condition: '<=' }, ({ i }) => { // for each layer
			const points_above = int(0).toVar();
			const h = float(i).mul(this.uLayerHeight);
			const col = this.getLayerColor(int(i)); // color of the layer
			const dark = mix(col, this.getLayerColor(int(i.sub(1))), giMix).mul(aoMul); // to color the bottom vertices of vertical quads
			// calculate the number of points above the current layer among the three vertices, and reorder them if needed to keep consistant
			If(h1.lessThan(h), () => {
				If(h2.lessThan(h), () => {
					points_above.assign(cond(h3.lessThan(h), 0, 1));

				}).else(() => {
					If(h3.lessThan(h), () => {
						points_above.assign(1);
						temp.xyz = v1.xyz;
						v1.xyz = v3.xyz;
						v3.xyz = v2.xyz;
						v2.xyz = temp.xyz;
					}).else(() => {
						points_above.assign(2);
						temp.xyz = v1.xyz;
						v1.xyz = v2.xyz;
						v2.xyz = v3.xyz;
						v3.xyz = temp.xyz;
					});
				});
			}).else(() => {
				If(h2.lessThan(h), () => {
					If(h3.lessThan(h), () => {
						points_above.assign(1);
						temp.xyz = v1.xyz;
						v1.xyz = v2.xyz;
						v2.xyz = v3.xyz;
						v3.xyz = temp.xyz;
					}).else(() => {
						points_above.assign(2);
						temp.xyz = v1.xyz;
						v1.xyz = v3.xyz;
						v3.xyz = v2.xyz;
						v2.xyz = temp.xyz;
					});

				}).else(() => {
					If(h3.lessThan(h), () => {
						points_above.assign(2);
					}).else(() => {
						points_above.assign(3);
					});
				});
			})

			// update height in case of reorder
			h1.assign(v1.y);
			h2.assign(v2.y);
			h3.assign(v3.y);

			// define cap points
			const v1_c = vec3(v1.x, h, v1.z);
			const v2_c = vec3(v2.x, h, v2.z);
			const v3_c = vec3(v3.x, h, v3.z);

			// define bottom points
			const v1_b = vec3(v1.x, h.sub(this.uLayerHeight), v1.z);
			const v2_b = vec3(v2.x, h.sub(this.uLayerHeight), v2.z);
			const v3_b = vec3(v3.x, h.sub(this.uLayerHeight), v3.z);

			// treat each configuration
			If(points_above.equal(3), () => {
				// just a flat triangle
				positions.element(vIndex).assign(v1_c);
				positions.element(vIndex.add(1)).assign(v2_c);
				positions.element(vIndex.add(2)).assign(v3_c);

				nn.assign(this.calcNormal([v1_c, v2_c, v3_c]));
				normals.element(vIndex).assign(nn);
				normals.element(vIndex.add(1)).assign(nn);
				normals.element(vIndex.add(2)).assign(nn);

				colors.element(vIndex).xyz.assign(col.xyz);
				colors.element(vIndex.add(1)).xyz.assign(col.xyz);
				colors.element(vIndex.add(2)).xyz.assign(col.xyz);

				vIndex.addAssign(3);

			}).else(() => {
				// interpolate the points to get projections at threshold height
				const t1 = h1.sub(h).div(h1.sub(h3));
				const v1_c_n = mix(v1_c, v3_c, t1);
				const v1_b_n = mix(v1_b, v3_b, t1);
				const t2 = h2.sub(h).div(h2.sub(h3));
				const v2_c_n = mix(v2_c, v3_c, t2);
				const v2_b_n = mix(v2_b, v3_b, t2);

				If(points_above.equal(2), () => {

					// 2 triangles cap
					positions.element(vIndex).assign(v1_c);
					positions.element(vIndex.add(1)).assign(v2_c);
					positions.element(vIndex.add(2)).assign(v2_c_n);
					nn.assign(this.calcNormal([v1_c, v2_c, v2_c_n]));
					normals.element(vIndex).assign(nn);
					normals.element(vIndex.add(1)).assign(nn);
					normals.element(vIndex.add(2)).assign(nn);
					colors.element(vIndex).xyz.assign(col.xyz);
					colors.element(vIndex.add(1)).xyz.assign(col.xyz);
					colors.element(vIndex.add(2)).xyz.assign(col.xyz);
					vIndex.addAssign(3);
					/////////////////////////////////////////
					positions.element(vIndex).assign(v2_c_n);
					positions.element(vIndex.add(1)).assign(v1_c_n);
					positions.element(vIndex.add(2)).assign(v1_c);
					nn.assign(this.calcNormal([v2_c_n, v1_c_n, v1_c]));
					normals.element(vIndex).assign(nn);
					normals.element(vIndex.add(1)).assign(nn);
					normals.element(vIndex.add(2)).assign(nn);
					colors.element(vIndex).xyz.assign(col.xyz);
					colors.element(vIndex.add(1)).xyz.assign(col.xyz);
					colors.element(vIndex.add(2)).xyz.assign(col.xyz);
					vIndex.addAssign(3);
					/////////////////////////////////////////
					// 2 triangles vertical wall 
					positions.element(vIndex).assign(v1_c_n);
					positions.element(vIndex.add(1)).assign(v2_c_n);
					positions.element(vIndex.add(2)).assign(v2_b_n);
					nn.assign(this.calcNormal([v1_c_n, v2_c_n, v2_b_n]));
					normals.element(vIndex).assign(nn);
					normals.element(vIndex.add(1)).assign(nn);
					normals.element(vIndex.add(2)).assign(nn);
					colors.element(vIndex).xyz.assign(col.xyz);
					colors.element(vIndex.add(1)).xyz.assign(col.xyz);
					colors.element(vIndex.add(2)).xyz.assign(dark.xyz); // fake AO at the bottom of the wall
					vIndex.addAssign(3);
					/////////////////////////////////////////
					positions.element(vIndex).assign(v1_c_n);
					positions.element(vIndex.add(1)).assign(v2_b_n);
					positions.element(vIndex.add(2)).assign(v1_b_n);
					nn.assign(this.calcNormal([v1_c_n, v2_b_n, v1_b_n]));
					normals.element(vIndex).assign(nn);
					normals.element(vIndex.add(1)).assign(nn);
					normals.element(vIndex.add(2)).assign(nn);
					colors.element(vIndex).xyz.assign(col.xyz);
					colors.element(vIndex.add(1)).xyz.assign(dark.xyz);
					colors.element(vIndex.add(2)).xyz.assign(dark.xyz);
					vIndex.addAssign(3);
					/////////////////////////////////////////

				}).elseif(points_above.equal(1), () => {

					// triangle cap
					positions.element(vIndex).assign(v3_c);
					positions.element(vIndex.add(1)).assign(v1_c_n);
					positions.element(vIndex.add(2)).assign(v2_c_n);
					nn.assign(this.calcNormal([v3_c, v1_c_n, v2_c_n]));
					normals.element(vIndex).assign(nn);
					normals.element(vIndex.add(1)).assign(nn);
					normals.element(vIndex.add(2)).assign(nn);
					colors.element(vIndex).xyz.assign(col.xyz);
					colors.element(vIndex.add(1)).xyz.assign(col.xyz);
					colors.element(vIndex.add(2)).xyz.assign(col.xyz);
					vIndex.addAssign(3);
					/////////////////////////////////////////
					// two triangles vertical wall
					positions.element(vIndex).assign(v2_c_n);
					positions.element(vIndex.add(1)).assign(v1_c_n);
					positions.element(vIndex.add(2)).assign(v2_b_n);
					nn.assign(this.calcNormal([v2_c_n, v1_c_n, v2_b_n]));
					normals.element(vIndex).assign(nn);
					normals.element(vIndex.add(1)).assign(nn);
					normals.element(vIndex.add(2)).assign(nn);
					colors.element(vIndex).xyz.assign(col.xyz);
					colors.element(vIndex.add(1)).xyz.assign(col.xyz);
					colors.element(vIndex.add(2)).xyz.assign(dark.xyz);
					vIndex.addAssign(3);
					/////////////////////////////////////////
					positions.element(vIndex).assign(v1_c_n);
					positions.element(vIndex.add(1)).assign(v1_b_n);
					positions.element(vIndex.add(2)).assign(v2_b_n);
					nn.assign(this.calcNormal([v1_c_n, v1_b_n, v2_b_n]));
					normals.element(vIndex).assign(nn);
					normals.element(vIndex.add(1)).assign(nn);
					normals.element(vIndex.add(2)).assign(nn);
					colors.element(vIndex).xyz.assign(col.xyz);
					colors.element(vIndex.add(1)).xyz.assign(dark.xyz);
					colors.element(vIndex.add(2)).xyz.assign(dark.xyz);
					vIndex.addAssign(3);
					/////////////////////////////////////////
				});
			});
		});

		// cleanup unused vertices
		loop({ type: 'int', start: vIndex, end: startIndex.add(this.maxSubdiv), condition: '<' }, ({ i }) => {
			positions.element(i).assign(vec4(0.0));
		});

		// base triangulation, must also remove comments in initMesh
		/*
		const positionStorageAttribute = storage(this.sbaVertices, 'vec4', this.sbaVertices.count);
		const normalStorageAttribute = storage(this.sbaNormals, 'vec4', this.sbaNormals.count);
		positionStorageAttribute.element(v0i).assign(v0Pos);
		positionStorageAttribute.element(v1i).assign(v1Pos);
		positionStorageAttribute.element(v2i).assign(v2Pos);

		nn.assign(v1Pos.sub(v0Pos).cross(v2Pos.sub(v0Pos)).normalize());
		normalStorageAttribute.element(v0i).assign(nn);
		normalStorageAttribute.element(v1i).assign(nn);
		normalStorageAttribute.element(v2i).assign(nn);
		*/

	})().compute(this.nbTris);


	// for all side quads
	computeSides = tslFn(() => {

		const cs = float(this.cellSize);
		const gw = float(this.gridWidth - 1); // margin 

		const side = instanceIndex.div(gw);
		const hgw = gw.mul(.5);

		const halfG = hgw.mul(cs);
		const d = instanceIndex.remainder(gw).toFloat().mul(cs);
		const norm = vec3(0.0, 0.0, 0.0).toVar();
		const px = float(0.0).toVar();
		const pz = float(0.0).toVar();
		const dir = vec3(0.0).toVar();

		If(side.equal(0), () => {
			px.assign(halfG.sub(d));
			pz.assign(halfG);
			norm.assign(vec3(0.0, 0.0, 1.0));
			dir.assign(vec3(cs.negate(), 0.0, 0.0));
		}).elseif(side.equal(1), () => {
			px.assign(halfG);
			pz.assign(d.sub(halfG));
			norm.assign(vec3(1.0, 0.0, 0.0));
			dir.assign(vec3(0.0, 0.0, cs));
		}).elseif(side.equal(2), () => {
			px.assign(d.sub(halfG));
			pz.assign(halfG.negate());
			norm.assign(vec3(0.0, 0.0, -1.0));
			dir.assign(vec3(cs, 0.0, 0.0));
		}).else(() => {
			px.assign(halfG.negate());
			pz.assign(halfG.sub(d));
			norm.assign(vec3(-1.0, 0.0, 0.0));
			dir.assign(vec3(0.0, 0.0, cs.negate()));
		});


		//const h1 = this.getHeight(vec3(px, 0.0, pz)).div(this.uLayerHeight).floor().mul(this.uLayerHeight).toVar();
		//const h2 = this.getHeight(vec3(px, 0.0, pz).add(dir)).div(this.uLayerHeight).floor().mul(this.uLayerHeight).toVar();
		// not rounding the heights looks better
		const h1 = this.getHeight(vec3(px, 0.0, pz)).toVar();
		const h2 = this.getHeight(vec3(px, 0.0, pz).add(dir)).toVar();
		const minh = min(h1, h2);
		const p1 = vec3(px, minh, pz);
		const p2 = vec3(px, minh, pz).add(dir);
		const p3 = vec3(px, 0.0, pz).add(dir);
		const p4 = vec3(px, 0.0, pz);

		const vIndex = instanceIndex.mul(6).toVar();
		const positions = storage(this.sbaSideVertices, 'vec4', this.sbaSideVertices.count);
		const normals = storage(this.sbaSideNormals, 'vec4', this.sbaSideNormals.count);

		positions.element(vIndex).assign(p1);
		positions.element(vIndex.add(1)).assign(p2);
		positions.element(vIndex.add(2)).assign(p3);
		positions.element(vIndex.add(3)).assign(p1);
		positions.element(vIndex.add(4)).assign(p3);
		positions.element(vIndex.add(5)).assign(p4);

		loop({ type: 'int', start: vIndex, end: vIndex.add(float(6)), condition: '<' }, ({ i }) => {
			normals.element(i).assign(norm);
		});

	})().compute(this.nbSideQuads);

	calcNormal = tslFn(([v0, v1, v2]) => {
		return v1.sub(v0).cross(v2.sub(v0)).normalize();
	});

	getLayerColor = tslFn(([layer]) => {

		const col = color(0.0).toVar();
		If(this.uRotatePalette.equal(0), () => {
			col.assign(this.layerColors.element((layer.remainder(this.uNbColors))));
		}).else(() => {
			const timer = timerGlobal(1).mul(this.uPaletteRotSpeed);
			const t1 = timer.floor();
			const t2 = this.gain(timer.fract(), 4.0);
			const c1 = this.layerColors.element((layer.add(t1).remainder(this.uNbColors)));
			const c2 = this.layerColors.element((layer.add(t1.add(1)).remainder(this.uNbColors)));
			col.assign(mix(c1, c2, t2));
		});
		return col;
	});

	getHeight = tslFn(([p]) => {
		const pointerMaxDistance = this.uCursorSize;
		const pointerPos = this.pointerHandler.uPointer;
		const dir = pointerPos.xz.sub(p.xz);
		const dist = min(pointerMaxDistance, dir.length()).div(pointerMaxDistance);
		//const dist2 = sdRoundedX(dir.rotateUV(timerGlobal(.5), vec2(0.0)), pointerMaxDistance, pointerMaxDistance.mul(0.5)).div(pointerMaxDistance).remapClamp(-1, 0, 0, 1);
		const timeFac = oscSine(timerGlobal(.1)).add(1.0).mul(0.5).mul(1.0).add(1.0); // some variation over time for fun
		const pInfluence = cond(this.uUseCursor.equal(0), 0, dist.oneMinus().mul(pointerMaxDistance.mul(.5).mul(timeFac)));

		const st = vec3(p.x, 0.0, p.z).mul(this.uFrequency).toVar();
		
		st.x.mulAssign(this.uNoiseScaleX);
		st.z.mulAssign(this.uNoiseScaleZ);
		cond(this.uRotationSpeed.greaterThan(0), st.xz.rotateUVAssign(this.uScrollOffset.w, this.uScrollOffset.xz.negate()), 0);
		st.addAssign(this.uScrollOffset.xyz);
		
		return max(0.0, mx_fractal_noise_float(st, int(this.uOctaves), 2.0, 0.75, 0.5).add(0.5).mul(this.uNbLayers).mul(this.uLayerHeight).sub(pInfluence));
	});

	pcurve = tslFn(([x, a, b]) => {
		const k = float(pow(a.add(b), a.add(b)).div(pow(a, a).mul(pow(b, b))));
		return k.mul(pow(x, a).mul(pow(sub(1.0, x), b)));
	});

	gain = tslFn(([x, k]) => {
		const a = float(mul(0.5, pow(mul(2.0, cond(x.lessThan(0.5), x, sub(1.0, x))), k))).toVar();
		return cond(x.lessThan(0.5), a, sub(1.0, a));
	});
	//////////////////////////////////////////////////////////////

	update(dt: number, elapsed: number): void {

		this.renderer.computeAsync(this.computeTriangles);
		if (!this.hideWalls) this.renderer.computeAsync(this.computeSides);

		this.uScrollOffset.value.x += dt * this.uScrollTimeScale.value * this.uScrollSpeedX.value;
		this.uScrollOffset.value.y += dt * this.uScrollTimeScale.value * this.uScrollSpeedY.value;
		this.uScrollOffset.value.z += dt * this.uScrollTimeScale.value * this.uScrollSpeedZ.value;
		this.uScrollOffset.value.w += dt * this.uScrollTimeScale.value * this.uRotationSpeed.value;
	}

}