import React,{useEffect,useRef,useId} from 'react';
import './context-dialog.css';

export function ContextDialog({title,onClose,children,className=''}){
  const ref=useRef(null),id=useId();
  useEffect(()=>{
    const dialog=ref.current,previous=document.activeElement;
    dialog.showModal();
    return()=>{dialog.close();if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[]);
  return <dialog ref={ref} className={`context-dialog ${className}`} aria-labelledby={id} onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{if(event.target===event.currentTarget)onClose();}}><div className="context-dialog-content"><header><h2 id={id}>{title}</h2><button type="button" onClick={onClose} aria-label={`Close ${title}`}>Close</button></header>{children}</div></dialog>;
}
