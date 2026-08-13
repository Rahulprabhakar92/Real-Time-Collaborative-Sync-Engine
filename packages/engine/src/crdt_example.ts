
type Id=[agent:string,seq:number]

type item={
    content:string,
    Id:Id,
    originLeft:Id|null,
    originRight:Id|null,
    isDeleted:boolean
}
type Version=Record<string,number>

type  Doc={
    content:item[],
    version:Version
}

function createDoc(): Doc{
    return{
        content:[],
        version:{}
    }
}

function getContent(doc:Doc):string{
    return doc.content
        .filter(item=>!item.isDeleted)
        .map(item=>item.content)
        .join("")
}


function localInsertOne(doc:Doc,agent:string,pos:number,text:string){
    const seq=(doc.version[agent]??-1)+1

    integrate(doc,{
        content:text,
        Id:[agent,seq],
        originLeft:doc.content[pos-1]?.Id??null,
        originRight:doc.content[pos]?.Id??null,
        isDeleted:false
    })
    
}

function localinsert(doc:Doc,agent:string,pos:number,text:string){
    const content=[...text]
    for(const c of content){
        localInsertOne(doc,agent,pos,c)
        pos++;

    }
}


const idEq = (a: Id | null, b: Id | null): boolean => (
  a == b || (a != null && b != null && a[0] === b[0] && a[1] === b[1])
)

function finditemIdxAtId(doc:Doc,id:Id |null):number|null{
    if(id===null) return null;

    return doc.content.findIndex(c=>idEq(c.Id,id))
}

function integrate(doc:Doc,newItem:item){
    
    const [agent,seq]=newItem.Id;
    const lastseen=doc.version[agent]??-1;
    if(seq !== lastseen+1) throw Error("Operation Out of Order")
    
    doc.version[agent]=seq;

    let left = finditemIdxAtId(doc, newItem.originLeft) ?? -1
    let destIdx=left+1;
    let right=newItem.originRight===null?doc.content.length:finditemIdxAtId(doc,newItem.originRight)!
    let scanning =false

    for(let i =destIdx;;i++){
        if(!scanning) destIdx=i;

        if(i===doc.content.length) break;
        if(i===right) break;

        let other=doc.content[i]

        let oleft=finditemIdxAtId(doc,other.originLeft)??-1;
        let oright=other.originRight===null?doc.content.length:finditemIdxAtId(doc,other.originRight)!;

        if (oleft < left || (oleft === left && oright === right && newItem.Id[0] < other.Id[0])) break
        if (oleft === left) scanning = oright < right

       

    }
     doc.content.splice(destIdx,0,newItem);
}

 function isinVersion(id:Id|null,version:Version):boolean{
    if(id==null) return true;
    const [agent,seq]=id
    const highestseq=version[agent]
    if(highestseq == null){
        return false
    }else{
        return highestseq>=seq
    }
}


 function canInserNow(item:item,doc:Doc):boolean{
    const [agent,seq]= item.Id
    return !isinVersion(item.Id,doc.version)
    && isinVersion(item.originLeft,doc.version)
    && isinVersion(item.originRight,doc.version)

        
}
 function MergeInto(dest:Doc,src:Doc ){
    const missing:(item|null)[] =src.content.filter(item=>!isinVersion(item.Id,dest.version))
    let remaining=missing.length;
    while(remaining>0){
        let mergerOnthisPass=0;

        for(let i =0;i<missing.length;i++){
            const op=missing[i];
            if(op === null) continue;
            if(!canInserNow(op,dest)) continue;
            integrate(dest,op)
            missing[i]=null;
            remaining--;
            mergerOnthisPass++;
        }
        if(mergerOnthisPass===0) throw Error("Not making Progress")

    }
}

const doc=createDoc()
const doc2=createDoc()
localinsert(doc,"rahul",0,"hello")
MergeInto(doc2,doc)


localinsert(doc,"rahul",5,"this")
localinsert(doc,"rahul",9,"is")
console.log('DOc2 has content before secound merge',getContent(doc2))
console.log('DOc has content before secound merge',getContent(doc))


MergeInto(doc2,doc)
console.log('DOc2 has content',getContent(doc2))




console.log(getContent(doc))



























