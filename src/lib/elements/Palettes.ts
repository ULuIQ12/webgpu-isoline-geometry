import { Color } from "three";
import { uniforms } from "three/examples/jsm/nodes/Nodes.js";

export class Palettes {

    static defaultColors = uniforms([
		new Color(0xff1f70),
		new Color(0x3286ff),
		new Color(0xffba03),
		new Color(0xff6202),
		new Color(0x874af3),
		new Color(0x14b2a1),
		new Color(0x3a5098),
		new Color(0xf53325),
	]);

    static earthyColors = uniforms([
		new Color(0xf2cb7c),
		new Color(0xc5de42),
		new Color(0xa3c83c),
		new Color(0xce9639),
		new Color(0xfdce62),
		new Color(0xdbab3f),
		new Color(0xe57627),
		new Color(0xdb924d),
	]);

    static rainbowColors = uniforms([
		new Color(0x448aff),
		new Color(0x1565c0),
		new Color(0x009688),
		new Color(0x8bc34a),
		new Color(0xffc107),
		new Color(0xff9800),
		new Color(0xf44336),
		new Color(0xad1457)
	]);

	static shibuyaColor = uniforms([
		new Color(0x1d1d1b),
		new Color( 0xffd200),
		new Color(0xd2b0a3),
		new Color(0xe51f23),
		new Color(0xe6007b),
		new Color(0x005aa7),
		new Color(0x5ec5ee),
		new Color( 0xf9f0de),
	]);

	static tuttiColors = uniforms([
		new Color(0xd7312e),
		new Color(0xf9f0de),
		new Color(0xf0ac00),
		new Color(0x0c7e45),
		new Color(0x2c52a0),
		new Color(0xf7bab6),
		new Color(0x5ec5ee),
		new Color(0xece3d0),
	 ]);

    static blackWhite = uniforms([
        new Color(0x000000),
        new Color(0xffffff),
    ]);

    static mondrian = uniforms([
        new Color(0x000000),
        new Color(0xff0000),
        new Color(0x0000ff),
        new Color(0xffd800),
        new Color(0xffffff),


    ]);


    static get pinkBlueMirror() {
        const colors = [];
        const nb:number = 16;
        const pink = new Color(0xff0066);
        const blue = new Color(0x00b7fb);
        const temp = new Color();
        for( let i:number = 0 ;i< nb; i++) {
            const r:number = i/(nb-1);
            if( r<0.5) {
                temp.lerpColors(pink, blue, r*2);
            } else {
                temp.lerpColors(blue, pink, (r-0.5)*2);
            }
            colors.push( temp.clone() );
        }
        return uniforms(colors);
    }

    static getGrayGradient(samples:number) {
        const colors = [];
        const s:number =samples + 3; 
        for( let i:number = 0 ;i< s; i++) {
            //colors.push( new Color().setHSL(0, 0, Math.pow( i/samples, 0.75)*2) );
            colors.push( new Color().setHSL(0, 0,i/(s-1) ));
        }
        return uniforms(colors);

    }
}