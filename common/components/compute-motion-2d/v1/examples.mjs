/** Independent consumer: generic teaching compositions; no episode facts/cues. */
import * as K from './index.mjs';
const {C,center:ct}=K;
export const DURATION=16;
export const EXAMPLES=['cpu-gpu','memory-wall','dataflow-fabric','sensor-to-model'];
export function renderExample(name,time,{width=1080,height=1440,transparent=false}={}){
 if(!EXAMPLES.includes(name))throw Error('Unknown Common example '+name);
 const id='compute',head={ 'cpu-gpu':['CPU 与 GPU','大核心与并行阵列 · 通用结构示意'], 'memory-wall':['内存与计算','权重搬运 · 缓存排队 · 等待数据'], 'dataflow-fabric':['计算与数据路径','编译规划 · 单元协同 · 结果复用'], 'sensor-to-model':['从感知到模型','相机输入 · 特征关系 · 计算资源']}[name];
 let body=K.backdrop({x:40,y:240,width:1000,height:1000,id})+ct(540,100,'COMMON / COMPUTE MOTION',23,C.muted)+ct(540,188,head[0],56,C.white,'font-weight="700"')+ct(540,250,head[1],27,C.muted);
 if(name==='cpu-gpu')body+=K.cpu({x:295,y:650,width:340,height:340,time,id})+K.gpu({x:785,y:650,width:340,height:340,time,id})+ct(295,940,'CPU',40,C.cyan)+ct(785,940,'GPU',40,C.purple);
 if(name==='memory-wall')body+=K.memoryWall({x:40,y:390,width:1000,time,stalled:K.ease((time-1.1)/.7),id});
 if(name==='dataflow-fabric')body+=K.dataflowFabric({x:40,y:365,width:1000,time,reuse:K.ease(time-1),columns:2,rows:2,id,label:'任务规划 · 数据就绪后计算'});
 if(name==='sensor-to-model')body+=K.cameraSensor({x:240,y:650,size:250,time,id})+K.dataBus({points:[[370,650],[460,650]],time,color:C.cyan})+K.modelNetwork({x:685,y:650,width:360,height:250,time})+K.dataBus({points:[[685,820],[685,900]],time,color:C.purple,count:1})+K.chipPackage({x:685,y:1050,size:185,time,id,label:'AI'});
 body+=ct(540,1340,'纯二维组件演示 · 不代表实际芯片结构或性能',25,C.muted);
 const scale=Math.min(width/1080,height/1440);return K.svgDoc(K.group(body,(width-1080*scale)/2,(height-1440*scale)/2,scale),{width,height,id,transparent});
}
export function renderGallery(time,options){if(!Number.isFinite(time))throw Error('Finite time required');const t=Math.max(0,Math.min(DURATION-1/60,time)),index=Math.min(3,Math.floor(t/4));return renderExample(EXAMPLES[index],t-index*4,options)}
