import {useEffect,useState} from 'react';

export function useFlowMotion(host,{enabled=true,initialPlaying=false}={}){
  const [requested,setRequested]=useState(initialPlaying);
  const [visible,setVisible]=useState(false);
  const [reduced,setReduced]=useState(()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false);
  useEffect(()=>{
    let intersecting=false;
    const sync=()=>setVisible(intersecting&&!document.hidden);
    const observer=new IntersectionObserver(entries=>{intersecting=entries[0].isIntersecting;sync();});
    observer.observe(host.current);
    const media=matchMedia('(prefers-reduced-motion: reduce)'),change=()=>setReduced(media.matches);
    media.addEventListener('change',change);document.addEventListener('visibilitychange',sync);
    return()=>{observer.disconnect();media.removeEventListener('change',change);document.removeEventListener('visibilitychange',sync);};
  },[]);
  return {playing:enabled&&requested&&visible&&!reduced,requested,reduced,toggle:()=>setRequested(value=>!value)};
}
