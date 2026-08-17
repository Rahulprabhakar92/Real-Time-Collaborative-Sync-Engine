

export type Id=[agent:string,seq:number]
export type Item={
    content:string,
    Id:Id,
    originLeft:Id|null,
    originRight:Id|null,
    deleted:boolean
}
export type Version=Record<string,number>

export type Doc={
    content:Item[],
    version:Version
}

export function createDoc(){
    return{
        content:[],
        version:{}
    }
}

export function getContent(doc:Doc){
    return doc.content  
            .filter(item=>!item.deleted)
            .map(item=>item.content)
            .join("")
}

const idEq = (a: Id | null, b: Id | null): boolean => (
    a == b || (a != null && b != null && a[0] === b[0] && a[1] === b[1])
);

export function findItemIdxatid(doc:Doc,id:Id|null){
    const idx=doc.content.findIndex(c=>idEq(c.Id,id))
    return idx === -1 ? null :idx
}

export function integrate(doc:Doc,newItem:Item){
    const [agent,seq]=newItem.Id
    const lastseen=doc.version[agent] ?? -1;

    if(seq !== lastseen +1) throw new Error("Operation OPut of Bounds")
    
    doc.version[agent]=seq;

    let scanning=false
    const left=findItemIdxatid(doc,newItem.originLeft) ?? -1;
    let bestIdx=left+1;
    const right=newItem.originRight===null?doc.content.length:findItemIdxatid(doc,newItem.originRight)!

    for(let i =bestIdx;;i++){
        if(!scanning) bestIdx=i;
        if(i===doc.content.length) break;
        if(i===right) break;

        let other=doc.content[i];
        let oleft=findItemIdxatid(doc,other.originLeft) ?? -1;
        let oright=other.originRight===null?doc.content.length:findItemIdxatid(doc,other.originRight)!

        if (oleft < left || (oleft === left && oright === right && newItem.Id[0] < other.Id[0])) break;
        if (oleft === left) scanning = oright < right;
    }
    
    doc.content.splice(bestIdx, 0, newItem);
}

export function findItemAtpos(doc:Doc,pos:number,stickEnd:boolean=false){
    let i=0;
    for( i=0;i<doc.content.length;i++){
        const item=doc.content[i];
        if(stickEnd && pos === 0) return i;
        else if(item.deleted) continue;
        else if(pos === 0) return i;

        pos--;
    }
    if(pos === 0) return i;
    throw new Error("Position Part out of the Document");
}



export function localinsertOne(doc:Doc,pos:number,agent:string,text:string){

    const seq=doc.version[agent]??-1;

    const actualIdx=findItemAtpos(doc,pos)


    integrate(doc,{
        content:text,
        Id:[agent,seq+1],
        deleted:false,
        originLeft:doc.content[actualIdx-1]?.Id ?? null,
        originRight:doc.content[actualIdx]?.Id ?? null
    })

}

export function localInsert(doc:Doc,pos:number,agent:string,text:string){
    const newlyCreatedItems:Item[]=[];
    for(const c of text){
        localinsertOne(doc,pos,agent,c)

        const currentSeq=doc.version[agent];
        const newItem=doc.content.find(item => item.Id[0] === agent && item.Id[1] === currentSeq);
        if(newItem){
            newlyCreatedItems.push(newItem);
        }

        pos++
    }
    return newlyCreatedItems;
}

export function localDelete(doc:Doc,agent:string,pos:number,length:number=1){
    const deletedItems:Item[]=[];
    for(let i =0;i<length;i++){
        const actualIdx=findItemAtpos(doc,pos);
        doc.content[actualIdx].deleted=true;
        deletedItems.push(doc.content[actualIdx])
    }
    return deletedItems;

}

export function isinVersion(id:Id |null |undefined,version:Version): boolean{
    if(id== null) return true;
    const [agent,seq]=id;
    const highestseq=version[agent];

    if(highestseq == null) return false;

    return highestseq>=seq
}

export function canInserNow(item:Item,dest:Version){
    const [agent,seq]=item.Id;
    
    const expectedSeq=(dest[agent] ?? -1)+1;
    if(seq !== expectedSeq){
        return false;
    }

    return !isinVersion(item.Id,dest) 
        && isinVersion(item.originLeft,dest)
        && isinVersion(item.originRight,dest)
}


export function mergeInto(dest:Doc,src:Doc){
    //sync deletion
    for(const srcItem of src.content){
        if(srcItem.deleted){
            const bestIdx=findItemIdxatid(dest,srcItem.Id)
            if( bestIdx!==null){
                dest.content[bestIdx].deleted=true;

            }
        }
    }

    let missing:(Item|null)[] =src.content.filter(item => !isinVersion(item.Id,dest.version))
    let remaining=missing.length;

    while(remaining>0){
        let mergerOnthisPass=0;

        for(let i =0;i<missing.length;i++){
            const op=missing[i];
            if(op === null) continue;
            if(!canInserNow(op,dest.version)) continue;
            integrate(dest,op)
            missing[i]=null;
            mergerOnthisPass++;
            remaining--;
        }
        // ... inside mergeInto's while loop ...
        
        if (mergerOnthisPass === 0) {
            // FIX: DO NOT THROW AN ERROR! 
            // Log a warning and gracefully break the loop so the server survives.
            console.warn(`[CRDT Sync] Dropped ${remaining} orphaned operations due to a packet collision.`);
            break; 
        }
    } // end of while loop
}
