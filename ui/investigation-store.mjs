import {validateInvestigation} from '../investigation-model.mjs';
const open=()=>new Promise((resolve,reject)=>{const request=indexedDB.open('canada-in-motion-investigations',1);request.onupgradeneeded=()=>request.result.createObjectStore('investigations',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
export async function listInvestigations(){
  const db=await open();try{return await new Promise((resolve,reject)=>{const r=db.transaction('investigations').objectStore('investigations').getAll();r.onsuccess=()=>{try{const valid=[];let invalidCount=0;for(const value of r.result){try{valid.push(validateInvestigation(value));}catch{invalidCount++;}}valid.sort((a,b)=>b.savedAt.localeCompare(a.savedAt));valid.invalidCount=invalidCount;resolve(valid);}catch(error){reject(error);}};r.onerror=()=>reject(r.error);});}finally{db.close();}
}
export async function saveInvestigation(value){
  validateInvestigation(value);const db=await open();try{await new Promise((resolve,reject)=>{const tx=db.transaction('investigations','readwrite');tx.objectStore('investigations').put(value);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
export async function deleteInvestigation(id){
  const db=await open();try{await new Promise((resolve,reject)=>{const tx=db.transaction('investigations','readwrite');tx.objectStore('investigations').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}
}
