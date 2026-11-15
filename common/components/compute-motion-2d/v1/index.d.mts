export const VERSION: '1.0.0';
export const C: Readonly<Record<'bg'|'panel'|'edge'|'white'|'muted'|'cyan'|'mint'|'amber'|'red'|'purple', string>>;
export interface ObjectOptions {
 x?:number;y?:number;width?:number;height?:number;size?:number;time?:number;
 load?:number;stalled?:boolean;color?:string;id?:string;label?:string;fill?:number;
 layers?:number;rows?:number;
}
export interface BusOptions {points:[number,number][];time?:number;color?:string;count?:number;speed?:number;active?:number;width?:number;arrow?:boolean}
export interface MemoryWallOptions extends Omit<ObjectOptions,'stalled'> {stalled?:number}
export interface FabricOptions extends ObjectOptions {reuse?:number;columns?:number}
export function cpu(options?:ObjectOptions):string;
export function gpu(options?:ObjectOptions):string;
export function chipPackage(options?:ObjectOptions):string;
export function memoryBank(options?:ObjectOptions):string;
export function cacheBuffer(options?:ObjectOptions):string;
export function computeTile(options?:ObjectOptions):string;
export function cameraSensor(options?:ObjectOptions):string;
export function modelNetwork(options?:ObjectOptions):string;
export function memoryWall(options?:MemoryWallOptions):string;
export function dataflowFabric(options?:FabricOptions):string;
export function dataBus(options:BusOptions):string;
export function pointAlong(points:[number,number][],progress:number):{x:number;y:number;heading:number};
export function defs(id?:string):string;
export function backdrop(options?:ObjectOptions&{grid?:boolean}):string;
export function panel(options?:ObjectOptions):string;
export function svgDoc(body:string,options?:{width?:number;height?:number;viewWidth?:number;viewHeight?:number;id?:string;transparent?:boolean}):string;
