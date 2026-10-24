// CDNs may compress responses and omit Content-Length. The model loader would
// otherwise copy its growing buffer for every chunk of a large download.
export function withPinnedModelLengths(fetcher,entries,origin,{chunkBytes=8*1024*1024}={}){
 const sizes=new Map(entries.map(entry=>['/'+entry.path,entry.bytes]));
 return async(input,init)=>{
  const url=new URL(input,origin),size=url.origin===origin?sizes.get(url.pathname):undefined;
  const originalHeaders=new Headers(init?.headers);
  const useRanges=size>chunkBytes&&init?.method!=='HEAD'&&!originalHeaders.has('Range');
  const controller=new AbortController();
  const signal=init?.signal?AbortSignal.any([init.signal,controller.signal]):controller.signal;
  async function part(start){
   const end=Math.min(size-1,start+chunkBytes-1),headers=new Headers(originalHeaders);
   headers.set('Range','bytes='+start+'-'+end);
   return fetcher(input,{...init,headers,signal});
  }
  let response=await (useRanges?part(0):fetcher(input,init));
  if(useRanges&&response.status===206){
   let offset=0,first=response;
   const body=new ReadableStream({
    async pull(stream){
     try{
      const expected=Math.min(chunkBytes,size-offset);let bytes;
      for(let attempt=0;attempt<3;attempt++){
       try{
        const current=first||await part(offset);first=null;
        if(current.status!==206){await current.body?.cancel();throw Error('Model download range unavailable.');}
        bytes=new Uint8Array(await current.arrayBuffer());
        if(bytes.length!==expected)throw Error('Model download was interrupted.');
        break;
       }catch(error){if(attempt===2||signal.aborted)throw error;}
      }
      offset+=bytes.length;stream.enqueue(bytes);
      if(offset===size)stream.close();
     }catch(error){controller.abort();stream.error(error);}
    },
    cancel(){controller.abort();return first?.body?.cancel();},
   });
   const headers=new Headers(response.headers);headers.delete('Content-Range');headers.delete('Content-Encoding');headers.set('Content-Length',String(size));
   return new Response(body,{status:200,headers});
  }
  if(response.status!==200||!Number.isSafeInteger(size)||size<1)return response;
  const headers=new Headers(response.headers);
  headers.set('Content-Length',String(size));
  // fetch has already decoded transport compression before exposing body bytes.
  headers.delete('Content-Encoding');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
 };
}
