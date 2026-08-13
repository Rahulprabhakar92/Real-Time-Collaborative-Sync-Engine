
import { useEffect, useRef, useState } from 'react'
import './App.css'
import { createDoc, Doc, getContent, mergeInto } from '@sync/engine';


export  function App() {
  const [text,setText]=useState("");
  const wsRef=useRef<WebSocket>(null);
  const docRef=useRef<Doc>(createDoc())
  const agentId=useRef(`client-${Math.random().toString(36).substring(7)}`)


  useEffect(()=>{
    wsRef.current=new WebSocket("ws://localhost:4000")
    wsRef.current.onmessage=(event)=>{ 
      const payload =JSON.parse(event.data)
      if(payload.type === 'sync'){
        docRef.current=payload.doc 
        setText(getContent(docRef.current))
      }else if (payload.type === 'insert' || payload.type === "delete"){
        const tempDoc:Doc=createDoc()
        tempDoc.content.push(payload.item)
        mergeInto(docRef.current,tempDoc)

        setText(getContent(docRef.current))
      }

    }

    return ()=>wsRef.current?.close();
  },[])



  return (
    <textarea 
    onChange={handleChange}
    value={text}
    style={{ width: '100%', height: '80vh' }}
    />
  )
}

export default App
