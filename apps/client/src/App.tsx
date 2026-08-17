
import React, { useEffect, useRef, useState } from 'react'
import './App.css'
import {Item, createDoc, Doc, getContent, localDelete, localinsertOne, mergeInto } from '@sync/engine';



export  function App() {
  const [text,setText]=useState("");
  const [isOnline,setIsOnline]=useState(false)//d

  const wsRef=useRef<WebSocket | null>(null);
  const docRef=useRef<Doc>(createDoc())
  const agentId=useRef(`${Math.random().toString(36).substring(7)}`)

  const docId=useRef<string>("");
  const offlineQueue=useRef<Item[]>([])

  if(!docId.current){
    const urlParams = new URLSearchParams(window.location.search);
    let idFromUrl = urlParams.get("docId");
     if(!idFromUrl){
      idFromUrl = `doc-${Math.random().toString(36).substring(7)}`
      window.history.replaceState(null,"",`?docId=${idFromUrl}`)
     }
     docId.current=idFromUrl
  }



  useEffect(()=>{
    //d
    function connect(){
      wsRef.current=new WebSocket(`ws://localhost:4000?docId=${docId.current}`)

      wsRef.current.onopen=()=>{
        setIsOnline(true);
        console.log("Connected To Server")

        if(offlineQueue.current.length > 0){
          console.log(`Sycning the ${offlineQueue.current.length} Offline Application`)
          wsRef.current?.send(JSON.stringify({
            type:'SYNC_BATCH',
            items:offlineQueue.current
          }))
        
        }
        offlineQueue.current = [];//clear
      };

    wsRef.current.onclose=()=>{
      setIsOnline(false);
      console.log("Connection Lost")
      setTimeout(connect,3000)
    }
    wsRef.current.onmessage=(event)=>{

      const payload=JSON.parse(event.data);

      if(payload.type==="sync"){
        docRef.current=payload.doc
        setText(getContent(docRef.current))
      }else if (payload.type==="INSERT" || payload.type === 'DELETE'){
        const tempDoc:Doc=createDoc()

        tempDoc.content.push(payload.item)
        mergeInto(docRef.current,tempDoc)
        setText(getContent(docRef.current))

      }else if(payload.type === "SYNC_BATCH"){
        const tempDoc:Doc=createDoc()
        for(const item of payload.items){
           tempDoc.content.push(item)
        }
        mergeInto(docRef.current,tempDoc);
        setText(getContent(docRef.current))
      }

    }

    }
    connect();
    
    return ()=>wsRef.current?.close()
  },[])

  function handleChange(e:React.ChangeEvent<HTMLTextAreaElement>){
    const newText=e.target.value;
    const curserPosition=e.target.selectionStart;

    let OperationItem:Item|undefined;
    let OperationType="";


    if(newText.length>text.length){
      //INSERT
      const insertedChar=newText[curserPosition-1];
      localinsertOne(docRef.current,curserPosition-1,agentId.current,insertedChar)
       OperationItem=docRef.current.content.find(item=>item.Id[0]===agentId.current && item.Id[1] === docRef.current.version[agentId.current])
       OperationType="INSERT"
       
    }else if(newText.length<text.length){
      //DELETE
      const deletedItem=localDelete(docRef.current,agentId.current,curserPosition)
      OperationItem=deletedItem[0];
      OperationType="DELETE"

    }

    if(OperationItem){
      if(wsRef.current?.readyState === WebSocket.OPEN){
         wsRef.current?.send(JSON.stringify({type:OperationType,item:OperationItem}))
      }else{
        //we are Offline
        offlineQueue.current.push(OperationItem);
      }
    }
    setText(getContent(docRef.current))
  }

  return (
    <div>
      <div style={{ padding: '10px', backgroundColor: isOnline ? 'lightgreen' : 'salmon' }}>
        {isOnline ? "🟢 Online" : "🔴 Offline - Changes saved locally"}
      </div>
      <textarea 
    onChange={handleChange}
    value={text}
    style={{ width: '100%', height: '80vh' }}
    />

    </div>
    
  )
}

export default App
