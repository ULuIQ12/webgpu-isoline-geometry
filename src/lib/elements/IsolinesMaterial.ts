// @ts-nocheck
// cutting the Typescript linting for this file, as it seems a bit too strict for the TSL code
import { abs, dot, float, If, MeshStandardNodeMaterial, mx_fractal_noise_vec3, normalLocal, normalView, oscSquare, positionWorld, ShaderNodeObject, tslFn, UniformNode, VarNode, vec3 } from "three/examples/jsm/nodes/Nodes.js";

export class IsolinesMaterial extends MeshStandardNodeMaterial {
    uWireFrame:ShaderNodeObject<UniformNode<unknown>>;
    uUseBands:ShaderNodeObject<UniformNode<unknown>>;
    uLayerHeight:ShaderNodeObject<UniformNode<unknown>>;
    uRoughness:ShaderNodeObject<UniformNode<unknown>>;
    uMetalness:ShaderNodeObject<UniformNode<unknown>>;
    heightNode:ShaderNodeObject<VarNode>;
    gridWidth = 0;
    cellSize = 0;
    constructor( 
        gridWidth:number, 
        cellSize:number, 
        uWireFrame:ShaderNodeObject<UniformNode<unknown>>,
        uLayerHeight:ShaderNodeObject<UniformNode<unknown>>,
        uUseBands:ShaderNodeObject<UniformNode<unknown>>,
        heightNode:ShaderNodeObject<VarNode>,
        uRoughness:ShaderNodeObject<UniformNode<unknown>>,
        uMetalness:ShaderNodeObject<UniformNode<unknown>>,
    ) {

        super();
        this.gridWidth = gridWidth;
        this.cellSize = cellSize;
        this.heightNode = heightNode;
        this.uWireFrame = uWireFrame;
        this.uUseBands = uUseBands;
        this.uLayerHeight = uLayerHeight;
        this.uRoughness = uRoughness;
        this.uMetalness = uMetalness;

        this.vertexColors = true;
        this.colorNode = this.customColorNode();
        this.normalNode = this.customNormalNode();
        this.roughnessNode = this.uRoughness;
        this.metalnessNode = this.uMetalness;
        //this.roughness = uRoughness;
		//this.metalness = 0.1;

    }

    customColorNode = tslFn(() => {
		const ocol = vec3(1.0).toVar();
        const margin = float(0.1);
		If( this.uWireFrame.equal(0), () => {
			const hgw = float(this.gridWidth*.5*this.cellSize).sub(this.cellSize*.5); // remove jagged edge due to tiling
			positionWorld.x.lessThan(hgw.negate().add(margin)).discard();
			positionWorld.x.greaterThan(hgw.sub(margin)).discard();
            // not necessary on Z, but I'm keeping it square
            positionWorld.z.lessThan(hgw.negate().add(margin)).discard();
            positionWorld.z.greaterThan(hgw.sub(margin)).discard();

			const d = abs( dot(normalLocal, vec3(0, 1, 0)) );
			If( d.greaterThan(0.5).and( this.uUseBands.equal(1)), () => { // banding effect only horizontal faces
				const smallNoise = mx_fractal_noise_vec3(positionWorld.xz.mul(10.0), 1, 2, 0.5, .1 );
				const band = oscSquare( this.heightNode(positionWorld.xyz.add(smallNoise)).mul(2).div(this.uLayerHeight) ).add(1.0).mul(0.25).oneMinus();
				ocol.mulAssign(band);
			});

		});
		
		return ocol;
	});

    customNormalNode = tslFn(() => {
        // adding graininess to the normal for a bit of texture
		const norm = normalView.xyz.toVar();
		If( this.uWireFrame.equal(0), () => {
			const st = positionWorld.mul(100.0);
			const n1 = mx_fractal_noise_vec3(st, 1, 2, 0.5, this.uRoughness.mul(0.5));
			norm.addAssign(n1.mul(0.5)).normalizeAssign();
		});
		
		return norm;
	});
}