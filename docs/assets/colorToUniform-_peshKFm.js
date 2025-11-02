import{S as Y,c as nt,d as q,f as L,g as ot,u as at,h as st,G as ut,i as lt,j as G,k as I,w as ct,l as ht,E as ft}from"./index-9yctEQP9.js";const J=class V extends Y{constructor(t){t={...V.defaultOptions,...t},super(t),this.enabled=!0,this._state=nt.for2d(),this.blendMode=t.blendMode,this.padding=t.padding,typeof t.antialias=="boolean"?this.antialias=t.antialias?"on":"off":this.antialias=t.antialias,this.resolution=t.resolution,this.blendRequired=t.blendRequired,this.clipToViewport=t.clipToViewport,this.addResource("uTexture",0,1)}apply(t,e,i,n){t.applyFilter(this,e,i,n)}get blendMode(){return this._state.blendMode}set blendMode(t){this._state.blendMode=t}static from(t){const{gpu:e,gl:i,...n}=t;let a,u;return e&&(a=q.from(e)),i&&(u=L.from(i)),new V({gpuProgram:a,glProgram:u,...n})}};J.defaultOptions={blendMode:"normal",resolution:1,padding:0,antialias:"off",blendRequired:!1,clipToViewport:!0};let Ot=J;class D{constructor(t){typeof t=="number"?this.rawBinaryData=new ArrayBuffer(t):t instanceof Uint8Array?this.rawBinaryData=t.buffer:this.rawBinaryData=t,this.uint32View=new Uint32Array(this.rawBinaryData),this.float32View=new Float32Array(this.rawBinaryData),this.size=this.rawBinaryData.byteLength}get int8View(){return this._int8View||(this._int8View=new Int8Array(this.rawBinaryData)),this._int8View}get uint8View(){return this._uint8View||(this._uint8View=new Uint8Array(this.rawBinaryData)),this._uint8View}get int16View(){return this._int16View||(this._int16View=new Int16Array(this.rawBinaryData)),this._int16View}get int32View(){return this._int32View||(this._int32View=new Int32Array(this.rawBinaryData)),this._int32View}get float64View(){return this._float64Array||(this._float64Array=new Float64Array(this.rawBinaryData)),this._float64Array}get bigUint64View(){return this._bigUint64Array||(this._bigUint64Array=new BigUint64Array(this.rawBinaryData)),this._bigUint64Array}view(t){return this[`${t}View`]}destroy(){this.rawBinaryData=null,this._int8View=null,this._uint8View=null,this._int16View=null,this.uint16View=null,this._int32View=null,this.uint32View=null,this.float32View=null}static sizeOf(t){switch(t){case"int8":case"uint8":return 1;case"int16":case"uint16":return 2;case"int32":case"uint32":case"float32":return 4;default:throw new Error(`${t} isn't a valid view type`)}}}function E(r,t){const e=r.byteLength/8|0,i=new Float64Array(r,0,e);new Float64Array(t,0,e).set(i);const a=r.byteLength-e*8;if(a>0){const u=new Uint8Array(r,e*8,a);new Uint8Array(t,e*8,a).set(u)}}const dt={normal:"normal-npm",add:"add-npm",screen:"screen-npm"};var mt=(r=>(r[r.DISABLED=0]="DISABLED",r[r.RENDERING_MASK_ADD=1]="RENDERING_MASK_ADD",r[r.MASK_ACTIVE=2]="MASK_ACTIVE",r[r.INVERSE_MASK_ACTIVE=3]="INVERSE_MASK_ACTIVE",r[r.RENDERING_MASK_REMOVE=4]="RENDERING_MASK_REMOVE",r[r.NONE=5]="NONE",r))(mt||{});function k(r,t){return t.alphaMode==="no-premultiply-alpha"&&dt[r]||r}const xt=["precision mediump float;","void main(void){","float test = 0.1;","%forloop%","gl_FragColor = vec4(0.0);","}"].join(`
`);function pt(r){let t="";for(let e=0;e<r;++e)e>0&&(t+=`
else `),e<r-1&&(t+=`if(test == ${e}.0){}`);return t}function vt(r,t){if(r===0)throw new Error("Invalid value of `0` passed to `checkMaxIfStatementsInShader`");const e=t.createShader(t.FRAGMENT_SHADER);try{for(;;){const i=xt.replace(/%forloop%/gi,pt(r));if(t.shaderSource(e,i),t.compileShader(e),!t.getShaderParameter(e,t.COMPILE_STATUS))r=r/2|0;else break}}finally{t.deleteShader(e)}return r}let B=null;function gt(){var t;if(B)return B;const r=ot();return B=r.getParameter(r.MAX_TEXTURE_IMAGE_UNITS),B=vt(B,r),(t=r.getExtension("WEBGL_lose_context"))==null||t.loseContext(),B}class bt{constructor(){this.ids=Object.create(null),this.textures=[],this.count=0}clear(){for(let t=0;t<this.count;t++){const e=this.textures[t];this.textures[t]=null,this.ids[e.uid]=null}this.count=0}}class _t{constructor(){this.renderPipeId="batch",this.action="startBatch",this.start=0,this.size=0,this.textures=new bt,this.blendMode="normal",this.topology="triangle-strip",this.canBundle=!0}destroy(){this.textures=null,this.gpuBindGroup=null,this.bindGroup=null,this.batcher=null}}const A=[];let U=0;ut.register({clear:()=>{if(A.length>0)for(const r of A)r&&r.destroy();A.length=0,U=0}});function $(){return U>0?A[--U]:new _t}function F(r){A[U++]=r}let w=0;const Z=class O{constructor(t){this.uid=at("batcher"),this.dirty=!0,this.batchIndex=0,this.batches=[],this._elements=[],t={...O.defaultOptions,...t},t.maxTextures||(st("v8.8.0","maxTextures is a required option for Batcher now, please pass it in the options"),t.maxTextures=gt());const{maxTextures:e,attributesInitialSize:i,indicesInitialSize:n}=t;this.attributeBuffer=new D(i*4),this.indexBuffer=new Uint16Array(n),this.maxTextures=e}begin(){this.elementSize=0,this.elementStart=0,this.indexSize=0,this.attributeSize=0;for(let t=0;t<this.batchIndex;t++)F(this.batches[t]);this.batchIndex=0,this._batchIndexStart=0,this._batchIndexSize=0,this.dirty=!0}add(t){this._elements[this.elementSize++]=t,t._indexStart=this.indexSize,t._attributeStart=this.attributeSize,t._batcher=this,this.indexSize+=t.indexSize,this.attributeSize+=t.attributeSize*this.vertexSize}checkAndUpdateTexture(t,e){const i=t._batch.textures.ids[e._source.uid];return!i&&i!==0?!1:(t._textureId=i,t.texture=e,!0)}updateElement(t){this.dirty=!0;const e=this.attributeBuffer;t.packAsQuad?this.packQuadAttributes(t,e.float32View,e.uint32View,t._attributeStart,t._textureId):this.packAttributes(t,e.float32View,e.uint32View,t._attributeStart,t._textureId)}break(t){const e=this._elements;if(!e[this.elementStart])return;let i=$(),n=i.textures;n.clear();const a=e[this.elementStart];let u=k(a.blendMode,a.texture._source),s=a.topology;this.attributeSize*4>this.attributeBuffer.size&&this._resizeAttributeBuffer(this.attributeSize*4),this.indexSize>this.indexBuffer.length&&this._resizeIndexBuffer(this.indexSize);const l=this.attributeBuffer.float32View,c=this.attributeBuffer.uint32View,v=this.indexBuffer;let f=this._batchIndexSize,d=this._batchIndexStart,g="startBatch";const b=this.maxTextures;for(let x=this.elementStart;x<this.elementSize;++x){const o=e[x];e[x]=null;const m=o.texture._source,h=k(o.blendMode,m),p=u!==h||s!==o.topology;if(m._batchTick===w&&!p){o._textureId=m._textureBindLocation,f+=o.indexSize,o.packAsQuad?(this.packQuadAttributes(o,l,c,o._attributeStart,o._textureId),this.packQuadIndex(v,o._indexStart,o._attributeStart/this.vertexSize)):(this.packAttributes(o,l,c,o._attributeStart,o._textureId),this.packIndex(o,v,o._indexStart,o._attributeStart/this.vertexSize)),o._batch=i;continue}m._batchTick=w,(n.count>=b||p)&&(this._finishBatch(i,d,f-d,n,u,s,t,g),g="renderBatch",d=f,u=h,s=o.topology,i=$(),n=i.textures,n.clear(),++w),o._textureId=m._textureBindLocation=n.count,n.ids[m.uid]=n.count,n.textures[n.count++]=m,o._batch=i,f+=o.indexSize,o.packAsQuad?(this.packQuadAttributes(o,l,c,o._attributeStart,o._textureId),this.packQuadIndex(v,o._indexStart,o._attributeStart/this.vertexSize)):(this.packAttributes(o,l,c,o._attributeStart,o._textureId),this.packIndex(o,v,o._indexStart,o._attributeStart/this.vertexSize))}n.count>0&&(this._finishBatch(i,d,f-d,n,u,s,t,g),d=f,++w),this.elementStart=this.elementSize,this._batchIndexStart=d,this._batchIndexSize=f}_finishBatch(t,e,i,n,a,u,s,l){t.gpuBindGroup=null,t.bindGroup=null,t.action=l,t.batcher=this,t.textures=n,t.blendMode=a,t.topology=u,t.start=e,t.size=i,++w,this.batches[this.batchIndex++]=t,s.add(t)}finish(t){this.break(t)}ensureAttributeBuffer(t){t*4<=this.attributeBuffer.size||this._resizeAttributeBuffer(t*4)}ensureIndexBuffer(t){t<=this.indexBuffer.length||this._resizeIndexBuffer(t)}_resizeAttributeBuffer(t){const e=Math.max(t,this.attributeBuffer.size*2),i=new D(e);E(this.attributeBuffer.rawBinaryData,i.rawBinaryData),this.attributeBuffer=i}_resizeIndexBuffer(t){const e=this.indexBuffer;let i=Math.max(t,e.length*1.5);i+=i%2;const n=i>65535?new Uint32Array(i):new Uint16Array(i);if(n.BYTES_PER_ELEMENT!==e.BYTES_PER_ELEMENT)for(let a=0;a<e.length;a++)n[a]=e[a];else E(e.buffer,n.buffer);this.indexBuffer=n}packQuadIndex(t,e,i){t[e]=i+0,t[e+1]=i+1,t[e+2]=i+2,t[e+3]=i+0,t[e+4]=i+2,t[e+5]=i+3}packIndex(t,e,i,n){const a=t.indices,u=t.indexSize,s=t.indexOffset,l=t.attributeOffset;for(let c=0;c<u;c++)e[i++]=n+a[c+s]-l}destroy(){if(this.batches!==null){for(let t=0;t<this.batches.length;t++)F(this.batches[t]);this.batches=null;for(let t=0;t<this._elements.length;t++)this._elements[t]&&(this._elements[t]._batch=null);this._elements=null,this.indexBuffer=null,this.attributeBuffer.destroy(),this.attributeBuffer=null}}};Z.defaultOptions={maxTextures:null,attributesInitialSize:4,indicesInitialSize:6};let St=Z;const yt=new Float32Array(1),Bt=new Uint32Array(1);class wt extends lt{constructor(){const e=new G({data:yt,label:"attribute-batch-buffer",usage:I.VERTEX|I.COPY_DST,shrinkToFit:!1}),i=new G({data:Bt,label:"index-batch-buffer",usage:I.INDEX|I.COPY_DST,shrinkToFit:!1}),n=6*4;super({attributes:{aPosition:{buffer:e,format:"float32x2",stride:n,offset:0},aUV:{buffer:e,format:"float32x2",stride:n,offset:2*4},aColor:{buffer:e,format:"unorm8x4",stride:n,offset:4*4},aTextureIdAndRound:{buffer:e,format:"uint16x2",stride:n,offset:5*4}},indexBuffer:i})}}function j(r,t,e){if(r)for(const i in r){const n=i.toLocaleLowerCase(),a=t[n];if(a){let u=r[i];i==="header"&&(u=u.replace(/@in\s+[^;]+;\s*/g,"").replace(/@out\s+[^;]+;\s*/g,"")),e&&a.push(`//----${e}----//`),a.push(u)}else ct(`${i} placement hook does not exist in shader`)}}const At=/\{\{(.*?)\}\}/g;function H(r){var i;const t={};return(((i=r.match(At))==null?void 0:i.map(n=>n.replace(/[{()}]/g,"")))??[]).forEach(n=>{t[n]=[]}),t}function N(r,t){let e;const i=/@in\s+([^;]+);/g;for(;(e=i.exec(r))!==null;)t.push(e[1])}function Q(r,t,e=!1){const i=[];N(t,i),r.forEach(s=>{s.header&&N(s.header,i)});const n=i;e&&n.sort();const a=n.map((s,l)=>`       @location(${l}) ${s},`).join(`
`);let u=t.replace(/@in\s+[^;]+;\s*/g,"");return u=u.replace("{{in}}",`
${a}
`),u}function K(r,t){let e;const i=/@out\s+([^;]+);/g;for(;(e=i.exec(r))!==null;)t.push(e[1])}function It(r){const e=/\b(\w+)\s*:/g.exec(r);return e?e[1]:""}function Ut(r){const t=/@.*?\s+/g;return r.replace(t,"")}function Pt(r,t){const e=[];K(t,e),r.forEach(l=>{l.header&&K(l.header,e)});let i=0;const n=e.sort().map(l=>l.indexOf("builtin")>-1?l:`@location(${i++}) ${l}`).join(`,
`),a=e.sort().map(l=>`       var ${Ut(l)};`).join(`
`),u=`return VSOutput(
            ${e.sort().map(l=>` ${It(l)}`).join(`,
`)});`;let s=t.replace(/@out\s+[^;]+;\s*/g,"");return s=s.replace("{{struct}}",`
${n}
`),s=s.replace("{{start}}",`
${a}
`),s=s.replace("{{return}}",`
${u}
`),s}function W(r,t){let e=r;for(const i in t){const n=t[i];n.join(`
`).length?e=e.replace(`{{${i}}}`,`//-----${i} START-----//
${n.join(`
`)}
//----${i} FINISH----//`):e=e.replace(`{{${i}}}`,"")}return e}const S=Object.create(null),P=new Map;let zt=0;function Mt({template:r,bits:t}){const e=tt(r,t);if(S[e])return S[e];const{vertex:i,fragment:n}=Ct(r,t);return S[e]=et(i,n,t),S[e]}function Tt({template:r,bits:t}){const e=tt(r,t);return S[e]||(S[e]=et(r.vertex,r.fragment,t)),S[e]}function Ct(r,t){const e=t.map(u=>u.vertex).filter(u=>!!u),i=t.map(u=>u.fragment).filter(u=>!!u);let n=Q(e,r.vertex,!0);n=Pt(e,n);const a=Q(i,r.fragment,!0);return{vertex:n,fragment:a}}function tt(r,t){return t.map(e=>(P.has(e)||P.set(e,zt++),P.get(e))).sort((e,i)=>e-i).join("-")+r.vertex+r.fragment}function et(r,t,e){const i=H(r),n=H(t);return e.forEach(a=>{j(a.vertex,i,a.name),j(a.fragment,n,a.name)}),{vertex:W(r,i),fragment:W(t,n)}}const Vt=`
    @in aPosition: vec2<f32>;
    @in aUV: vec2<f32>;

    @out @builtin(position) vPosition: vec4<f32>;
    @out vUV : vec2<f32>;
    @out vColor : vec4<f32>;

    {{header}}

    struct VSOutput {
        {{struct}}
    };

    @vertex
    fn main( {{in}} ) -> VSOutput {

        var worldTransformMatrix = globalUniforms.uWorldTransformMatrix;
        var modelMatrix = mat3x3<f32>(
            1.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
            0.0, 0.0, 1.0
          );
        var position = aPosition;
        var uv = aUV;

        {{start}}

        vColor = vec4<f32>(1., 1., 1., 1.);

        {{main}}

        vUV = uv;

        var modelViewProjectionMatrix = globalUniforms.uProjectionMatrix * worldTransformMatrix * modelMatrix;

        vPosition =  vec4<f32>((modelViewProjectionMatrix *  vec3<f32>(position, 1.0)).xy, 0.0, 1.0);

        vColor *= globalUniforms.uWorldColorAlpha;

        {{end}}

        {{return}}
    };
`,Rt=`
    @in vUV : vec2<f32>;
    @in vColor : vec4<f32>;

    {{header}}

    @fragment
    fn main(
        {{in}}
      ) -> @location(0) vec4<f32> {

        {{start}}

        var outColor:vec4<f32>;

        {{main}}

        var finalColor:vec4<f32> = outColor * vColor;

        {{end}}

        return finalColor;
      };
`,Gt=`
    in vec2 aPosition;
    in vec2 aUV;

    out vec4 vColor;
    out vec2 vUV;

    {{header}}

    void main(void){

        mat3 worldTransformMatrix = uWorldTransformMatrix;
        mat3 modelMatrix = mat3(
            1.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
            0.0, 0.0, 1.0
          );
        vec2 position = aPosition;
        vec2 uv = aUV;

        {{start}}

        vColor = vec4(1.);

        {{main}}

        vUV = uv;

        mat3 modelViewProjectionMatrix = uProjectionMatrix * worldTransformMatrix * modelMatrix;

        gl_Position = vec4((modelViewProjectionMatrix * vec3(position, 1.0)).xy, 0.0, 1.0);

        vColor *= uWorldColorAlpha;

        {{end}}
    }
`,Dt=`

    in vec4 vColor;
    in vec2 vUV;

    out vec4 finalColor;

    {{header}}

    void main(void) {

        {{start}}

        vec4 outColor;

        {{main}}

        finalColor = outColor * vColor;

        {{end}}
    }
`,Et={name:"global-uniforms-bit",vertex:{header:`
        struct GlobalUniforms {
            uProjectionMatrix:mat3x3<f32>,
            uWorldTransformMatrix:mat3x3<f32>,
            uWorldColorAlpha: vec4<f32>,
            uResolution: vec2<f32>,
        }

        @group(0) @binding(0) var<uniform> globalUniforms : GlobalUniforms;
        `}},kt={name:"global-uniforms-bit",vertex:{header:`
          uniform mat3 uProjectionMatrix;
          uniform mat3 uWorldTransformMatrix;
          uniform vec4 uWorldColorAlpha;
          uniform vec2 uResolution;
        `}};function $t({bits:r,name:t}){const e=Mt({template:{fragment:Rt,vertex:Vt},bits:[Et,...r]});return q.from({name:t,vertex:{source:e.vertex,entryPoint:"main"},fragment:{source:e.fragment,entryPoint:"main"}})}function Ft({bits:r,name:t}){return new L({name:t,...Tt({template:{vertex:Gt,fragment:Dt},bits:[kt,...r]})})}const jt={name:"color-bit",vertex:{header:`
            @in aColor: vec4<f32>;
        `,main:`
            vColor *= vec4<f32>(aColor.rgb * aColor.a, aColor.a);
        `}},Ht={name:"color-bit",vertex:{header:`
            in vec4 aColor;
        `,main:`
            vColor *= vec4(aColor.rgb * aColor.a, aColor.a);
        `}},z={};function Nt(r){const t=[];if(r===1)t.push("@group(1) @binding(0) var textureSource1: texture_2d<f32>;"),t.push("@group(1) @binding(1) var textureSampler1: sampler;");else{let e=0;for(let i=0;i<r;i++)t.push(`@group(1) @binding(${e++}) var textureSource${i+1}: texture_2d<f32>;`),t.push(`@group(1) @binding(${e++}) var textureSampler${i+1}: sampler;`)}return t.join(`
`)}function Qt(r){const t=[];if(r===1)t.push("outColor = textureSampleGrad(textureSource1, textureSampler1, vUV, uvDx, uvDy);");else{t.push("switch vTextureId {");for(let e=0;e<r;e++)e===r-1?t.push("  default:{"):t.push(`  case ${e}:{`),t.push(`      outColor = textureSampleGrad(textureSource${e+1}, textureSampler${e+1}, vUV, uvDx, uvDy);`),t.push("      break;}");t.push("}")}return t.join(`
`)}function Kt(r){return z[r]||(z[r]={name:"texture-batch-bit",vertex:{header:`
                @in aTextureIdAndRound: vec2<u32>;
                @out @interpolate(flat) vTextureId : u32;
            `,main:`
                vTextureId = aTextureIdAndRound.y;
            `,end:`
                if(aTextureIdAndRound.x == 1)
                {
                    vPosition = vec4<f32>(roundPixels(vPosition.xy, globalUniforms.uResolution), vPosition.zw);
                }
            `},fragment:{header:`
                @in @interpolate(flat) vTextureId: u32;

                ${Nt(r)}
            `,main:`
                var uvDx = dpdx(vUV);
                var uvDy = dpdy(vUV);

                ${Qt(r)}
            `}}),z[r]}const M={};function Wt(r){const t=[];for(let e=0;e<r;e++)e>0&&t.push("else"),e<r-1&&t.push(`if(vTextureId < ${e}.5)`),t.push("{"),t.push(`	outColor = texture(uTextures[${e}], vUV);`),t.push("}");return t.join(`
`)}function Xt(r){return M[r]||(M[r]={name:"texture-batch-bit",vertex:{header:`
                in vec2 aTextureIdAndRound;
                out float vTextureId;

            `,main:`
                vTextureId = aTextureIdAndRound.y;
            `,end:`
                if(aTextureIdAndRound.x == 1.)
                {
                    gl_Position.xy = roundPixels(gl_Position.xy, uResolution);
                }
            `},fragment:{header:`
                in float vTextureId;

                uniform sampler2D uTextures[${r}];

            `,main:`

                ${Wt(r)}
            `}}),M[r]}const Yt={name:"round-pixels-bit",vertex:{header:`
            fn roundPixels(position: vec2<f32>, targetSize: vec2<f32>) -> vec2<f32>
            {
                return (floor(((position * 0.5 + 0.5) * targetSize) + 0.5) / targetSize) * 2.0 - 1.0;
            }
        `}},qt={name:"round-pixels-bit",vertex:{header:`
            vec2 roundPixels(vec2 position, vec2 targetSize)
            {
                return (floor(((position * 0.5 + 0.5) * targetSize) + 0.5) / targetSize) * 2.0 - 1.0;
            }
        `}},X={};function Lt(r){let t=X[r];if(t)return t;const e=new Int32Array(r);for(let i=0;i<r;i++)e[i]=i;return t=X[r]=new ht({uTextures:{value:e,type:"i32",size:r}},{isStatic:!0}),t}class Jt extends Y{constructor(t){const e=Ft({name:"batch",bits:[Ht,Xt(t),qt]}),i=$t({name:"batch",bits:[jt,Kt(t),Yt]});super({glProgram:e,gpuProgram:i,resources:{batchSamplers:Lt(t)}})}}let T=null;const rt=class it extends St{constructor(t){super(t),this.geometry=new wt,this.name=it.extension.name,this.vertexSize=6,T??(T=new Jt(t.maxTextures)),this.shader=T}packAttributes(t,e,i,n,a){const u=a<<16|t.roundPixels&65535,s=t.transform,l=s.a,c=s.b,v=s.c,f=s.d,d=s.tx,g=s.ty,{positions:b,uvs:x}=t,o=t.color,_=t.attributeOffset,m=_+t.attributeSize;for(let h=_;h<m;h++){const p=h*2,y=b[p],R=b[p+1];e[n++]=l*y+v*R+d,e[n++]=f*R+c*y+g,e[n++]=x[p],e[n++]=x[p+1],i[n++]=o,i[n++]=u}}packQuadAttributes(t,e,i,n,a){const u=t.texture,s=t.transform,l=s.a,c=s.b,v=s.c,f=s.d,d=s.tx,g=s.ty,b=t.bounds,x=b.maxX,o=b.minX,_=b.maxY,m=b.minY,h=u.uvs,p=t.color,y=a<<16|t.roundPixels&65535;e[n+0]=l*o+v*m+d,e[n+1]=f*m+c*o+g,e[n+2]=h.x0,e[n+3]=h.y0,i[n+4]=p,i[n+5]=y,e[n+6]=l*x+v*m+d,e[n+7]=f*m+c*x+g,e[n+8]=h.x1,e[n+9]=h.y1,i[n+10]=p,i[n+11]=y,e[n+12]=l*x+v*_+d,e[n+13]=f*_+c*x+g,e[n+14]=h.x2,e[n+15]=h.y2,i[n+16]=p,i[n+17]=y,e[n+18]=l*o+v*_+d,e[n+19]=f*_+c*o+g,e[n+20]=h.x3,e[n+21]=h.y3,i[n+22]=p,i[n+23]=y}};rt.extension={type:[ft.Batcher],name:"default"};let te=rt;const C={name:"local-uniform-bit",vertex:{header:`

            struct LocalUniforms {
                uTransformMatrix:mat3x3<f32>,
                uColor:vec4<f32>,
                uRound:f32,
            }

            @group(1) @binding(0) var<uniform> localUniforms : LocalUniforms;
        `,main:`
            vColor *= localUniforms.uColor;
            modelMatrix *= localUniforms.uTransformMatrix;
        `,end:`
            if(localUniforms.uRound == 1)
            {
                vPosition = vec4(roundPixels(vPosition.xy, globalUniforms.uResolution), vPosition.zw);
            }
        `}},ee={...C,vertex:{...C.vertex,header:C.vertex.header.replace("group(1)","group(2)")}},re={name:"local-uniform-bit",vertex:{header:`

            uniform mat3 uTransformMatrix;
            uniform vec4 uColor;
            uniform float uRound;
        `,main:`
            vColor *= uColor;
            modelMatrix = uTransformMatrix;
        `,end:`
            if(uRound == 1.)
            {
                gl_Position.xy = roundPixels(gl_Position.xy, uResolution);
            }
        `}};class ie{constructor(){this.batcherName="default",this.topology="triangle-list",this.attributeSize=4,this.indexSize=6,this.packAsQuad=!0,this.roundPixels=0,this._attributeStart=0,this._batcher=null,this._batch=null}get blendMode(){return this.renderable.groupBlendMode}get color(){return this.renderable.groupColorAlpha}reset(){this.renderable=null,this.texture=null,this._batcher=null,this._batch=null,this.bounds=null}destroy(){}}function ne(r,t,e){const i=(r>>24&255)/255;t[e++]=(r&255)/255*i,t[e++]=(r>>8&255)/255*i,t[e++]=(r>>16&255)/255*i,t[e++]=i}export{ie as B,te as D,Ot as F,mt as S,D as V,jt as a,C as b,$t as c,ne as d,vt as e,E as f,Kt as g,Ft as h,Ht as i,Xt as j,re as k,ee as l,qt as m,Lt as n,k as o,Yt as r};
