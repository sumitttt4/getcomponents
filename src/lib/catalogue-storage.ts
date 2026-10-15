import type { Catalogue } from './types';
const database='unpack-catalogues',table='catalogues';
async function open():Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(database,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(table,{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error);
  });
}
export async function saveCatalogue(id:string,catalogue:Catalogue):Promise<void> {
  const db=await open();
  try { await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(table,'readwrite'),store=tx.objectStore(table),all=store.getAll();
    all.onsuccess=()=>{
      const items=(all.result as {id:string;savedAt:number}[]).sort((a,b)=>b.savedAt-a.savedAt);
      for(const item of items.filter((item,index)=>index>=9||Date.now()-item.savedAt>86400000)) store.delete(item.id);
      store.put({id,catalogue,savedAt:Date.now()});
    };
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  }); } finally { db.close(); }
}
export async function loadCatalogue(id:string):Promise<Catalogue|null> {
  const db=await open();
  try { return await new Promise((resolve,reject)=>{
    const request=db.transaction(table,'readonly').objectStore(table).get(id);
    request.onsuccess=()=>resolve(request.result&&Date.now()-request.result.savedAt<86400000?request.result.catalogue:null);
    request.onerror=()=>reject(request.error);
  }); } finally { db.close(); }
}
