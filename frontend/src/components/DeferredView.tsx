import { useEffect, useState, type ReactNode } from 'react';

/** Load a tool on first visit, then retain its controls and computed result. */
export default function DeferredView({active,children}:{active:boolean;children:ReactNode}) {
  const [visited,setVisited]=useState(active);
  useEffect(()=>{if(active)setVisited(true);},[active]);
  return <div className="deferred-view" style={{display:active?'contents':'none'}}>{(active||visited)&&children}</div>;
}
