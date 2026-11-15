/** Thin React adapter. Remotion host supplies time = useCurrentFrame()/fps.
 * No second animation engine, timer, React state or Remotion version coupling.
 */
import React from 'react';
import * as K from './index.mjs';
export type MotionObjectProps=K.ObjectOptions&{time:number};
const object=(draw:(options:K.ObjectOptions)=>string)=>function CommonObject(props:MotionObjectProps){return <g dangerouslySetInnerHTML={{__html:draw(props)}}/>};
export const Cpu=object(K.cpu);
export const Gpu=object(K.gpu);
export const ChipPackage=object(K.chipPackage);
export const MemoryBank=object(K.memoryBank);
export const CacheBuffer=object(K.cacheBuffer);
export const ComputeTile=object(K.computeTile);
export const ModelNetwork=object(K.modelNetwork);
export const CameraSensor=object(K.cameraSensor);
export function DataBus(props:K.BusOptions&{time:number}){return <g dangerouslySetInnerHTML={{__html:K.dataBus(props)}}/>}
export function MemoryWall(props:K.MemoryWallOptions&{time:number}){return <g dangerouslySetInnerHTML={{__html:K.memoryWall(props)}}/>}
export function DataflowFabric(props:K.FabricOptions&{time:number}){return <g dangerouslySetInnerHTML={{__html:K.dataflowFabric(props)}}/>}
export function ComputeCanvas({children,width=1080,height=1280,id='compute'}:{children?:React.ReactNode;width?:number;height?:number;id?:string}){
 return <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} fontFamily="Noto Sans CJK SC, sans-serif"><g dangerouslySetInnerHTML={{__html:K.defs(id)}}/>{children}</svg>;
}
