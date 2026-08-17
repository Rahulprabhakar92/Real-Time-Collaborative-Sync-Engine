
import React, { useEffect, useRef, useState } from 'react'
import './App.css'
import {Item, createDoc, Doc, getContent, localDelete, localinsertOne, mergeInto, localInsert } from '@sync/engine';



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



  useEffect(() => {
    const handleOffline = () => {
      console.log("Browser network went offline!");
      setIsOnline(false);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close(); 
      }
    };

    const handleOnline = () => {
      console.log("Browser network came back online!");

    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);


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


    if(newText.length>text.length){
      //INSERt
      const insertCount = newText.length - text.length;
      const startIndex=curserPosition - insertCount;
      const insertedString=newText.substring(startIndex,curserPosition);

      const newItems=localInsert(docRef.current,startIndex,agentId.current,insertedString);

      if(newItems.length > 0){
        if(wsRef.current?.readyState === WebSocket.OPEN){
          wsRef.current.send(JSON.stringify({type:"SYNC_BATCH",items:newItems}))
        }else{
          offlineQueue.current.push(...newItems);
        }
      }
       
    }else if(newText.length<text.length){
      //DELETE
      const deletedCount=text.length - newText.length;
      const deletedItems=localDelete(docRef.current,agentId.current,curserPosition,deletedCount);

     if(deletedItems.length > 0 ){
        if(wsRef.current?.readyState === WebSocket.OPEN){
          wsRef.current.send(JSON.stringify({type:"SYNC_BATCH",items:deletedItems}))
        }else{
          offlineQueue.current.push(...deletedItems);
        }
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
