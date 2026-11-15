/** A second, brand-free consumer of the public components. */
import {C,svgDoc,text,line,rect,vehicle,rider,roadWorld,worldFrame,sensorField,trajectory,trackingBox,modelCore,feedbackCircuit,ease,pose} from './index.mjs';
export function renderKitDemoSVG(frame,{fps=60,width=1080,height=1920}={}){
  if(!Number.isFinite(frame)||frame<0||!Number.isFinite(fps)||fps<=0)throw Error('Finite nonnegative frame and positive fps required');
  const t=frame/fps,section=Math.min(3,Math.floor(t/4)),local=t-section*4,wide=width>height;
  const W=wide?1920:1080,H=wide?1080:1920;
  let s=text(60,110,'ADAS / 二维公共组件',29,C.blue,'letter-spacing="2"')+text(60,195,['通用车辆模型','感知与目标跟踪','轨迹与行为候选','模型与反馈回路'][section],55,C.white,'font-weight="600"')+
    text(60,252,'纯二维 SVG · 确定性帧输入 · 通用示意',27,C.muted);
  if(section===0){
    for(let i=0;i<3;i++){
      const x=wide?420+i*520:210+i*330,y=wide?620:890;
      s+=vehicle({x,y:y-12*Math.sin(local*1.4+i*.7),kind:['sedan','suv','van'][i],paint:['silver','blue','amber'][i],scale:wide?1.55:1.7,steering:Math.sin(local*1.5)*18,brake:local>2.5,signal:i===1,time:t});
      s+=text(x,y+260,['轿车','SUV','厢式'][i],31,C.white,'text-anchor="middle"');
    }
    s+=text(60,wide?990:1440,'车轮转向、灯组、车身与玻璃分层可单独参数化',wide?29:30,C.muted);
  }else{
    const x=wide?980:54,y=wide?110:360,w=wide?870:972,h=wide?875:1210,L=1000*h/w;
    const start=L-155,points=[[650,start],[650,start-180],[350,start-220],[350,start-460]],p=ease(local/4),ego=pose(points,p*.75);
    let world=roadWorld({time:t,height:L});
    if(section===1)world+=sensorField({...ego,time:t})+rider({x:350,y:start-500,time:t})+trackingBox({x:350,y:start-500,label:'动态目标',width:105,height:170});
    if(section===2)world+=trajectory({points,time:t,progress:p,color:C.green})+trajectory({points:[[650,start],[650,start-180],[650,start-310],[650,start-470]],time:t,color:C.amber,progress:1,dashed:true,opacity:.5});
    if(section===3)world+=trajectory({points,time:t,color:C.green})+vehicle({x:350,y:start-520,paint:'silver',kind:'sedan'});
    world+=vehicle({...ego,time:t,steering:-12,brake:section===1});
    s+=worldFrame('generic-world',x,y,w,h,world);
    if(section===3){
      const mx=wide?250:95,my=wide?435:1650,mw=wide?420:300,mh=wide?365:210;
      s+=modelCore({x:mx,y:my,width:mw,height:mh,time:t,label:'策略模型'});
      if(wide)s+=feedbackCircuit({points:[[985,850],[650,1000],[650,800],[mx+mw,650]],time:t})+text(155,940,'环境反馈改变下一轮动作',29,C.purple);
      else s+=feedbackCircuit({points:[[960,1490],[1050,1680],[680,1820],[411,1760]],time:t})+
        trajectory({points:[[95,1720],[35,1690],[65,1590],[220,1535]],time:t,color:C.green,width:3});
    }
    if(wide)s+=text(60,320,['','对象与扫描共享世界坐标','曲线、车身朝向与运动保持一致','业务决定反馈含义，组件只负责绘制'][section],27,C.muted);
  }
  s+=text(W-60,H-45,'通用原理示意 / 非具体车型或内部模型',23,C.muted,'text-anchor="end"');
  return svgDoc(s,{width,height,viewWidth:W,viewHeight:H,namespace:`adas-gallery-${section}`});
}
