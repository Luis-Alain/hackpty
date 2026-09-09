export function scoreSourceSelection(raw:string,fixture:{sources:readonly {sourceId:string;text:string}[];expectedSourceIds:readonly string[]}){
  let payload:any;try{payload=JSON.parse(raw);}catch{return{passed:false,jsonValid:false,selectedIds:[],unsupportedSourceIdCount:null,duplicateIdCount:null,selectedIdPrecision:null,expectedIdRecall:null,noAnswerCorrect:false};}
  const ids=Array.isArray(payload?.sourceIds)?payload.sourceIds:[];
  const shape=!!payload&&typeof payload==='object'&&!Array.isArray(payload)&&Object.keys(payload).join(',')==='sourceIds'&&Array.isArray(payload.sourceIds)&&ids.length<=6&&ids.every(id=>typeof id==='string');
  const unique=new Set(ids),unsupported=ids.filter(id=>!fixture.sources.some(s=>s.sourceId===id)),relevant=ids.filter(id=>fixture.expectedSourceIds.includes(id)),recalled=new Set(relevant);
  return {passed:shape&&unsupported.length===0&&unique.size===ids.length&&recalled.size===fixture.expectedSourceIds.length&&relevant.length===ids.length,jsonValid:shape,selectedIds:ids,unsupportedSourceIdCount:unsupported.length,duplicateIdCount:ids.length-unique.size,selectedIdPrecision:ids.length?relevant.length/ids.length:null,expectedIdRecall:fixture.expectedSourceIds.length?recalled.size/fixture.expectedSourceIds.length:null,noAnswerCorrect:fixture.expectedSourceIds.length?null:shape&&ids.length===0};
}
