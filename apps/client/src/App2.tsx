import { createDoc, Doc, getContent, Item, localInsert, mergeInto } from "@sync/engine";
import React, { useEffect, useRef, useState } from "react";

 export function App2(){
    const [texts,setText]=useState("");
    const [online,setOnline]=useState(true)
    const docRef=useRef<Doc>(createDoc());
    const wsRef=useRef<WebSocket>(null);
    const agentId=useRef<string>(`${Math.random().toString(36).substring(7)}`)

    const docId=useRef<string>("")
    const offlineQueue=useRef<Item[]>([])

    if(!docId.current){
    const urlParams=new URLSearchParams(window.location.search);
        let idFromUrl=urlParams.get("docId");

        if(!idFromUrl){
        
             idFromUrl = `doc-${Math.random().toString(36).substring(7)}`
             window.history.replaceState(null,"",`?docId=${idFromUrl}`)
        }
        docId.current=idFromUrl
    }

    useEffect(()=>{

        const handleFailure=()=>{
            setOnline(false)

            if(wsRef.current &&wsRef.current.readyState === WebSocket.OPEN &&){
                wsRef.current.close()
            }
        }

        const handleOnline=()=>{
            console.log("Browser Network came back online")
        }

        window.addEventListener("offline",handleFailure)
        window.addEventListener("online",handleOnline)

        return(()=>{
            window.addEventListener("offline",handleFailure)
            window.addEventListener("online",handleOnline)
        })
    },[])


    useEffect(()=>{

        function connect(){
            wsRef.current=new WebSocket(`ws://localhost:4000?docId=${docId.current}`)

            wsRef.current.onopen=()=>{
                setOnline(true);
                console.log("Connected to server")

                if(offlineQueue.current.length >0){
                    wsRef.current?.send(JSON.stringify({type:"sync",items:offlineQueue.current}))
                }
                offlineQueue.current=[]
            }

            wsRef.current.onclose=()=>{
                setOnline(false)
                setTimeout(() => {
                    connect
                }, 3000);
            }

            wsRef.current.onmessage=(event)=>{
                const payload=event.data

                if(payload.type === "sync"){
                    docRef.current=payload.doc
                    setText(getContent(docRef.current))
                }else if(payload.type === "SYNC_BATCH"){
                    const tempDoc:Doc=createDoc();
                    for(const item of payload.items){
                        tempDoc.content.push(item)
                    }
                    mergeInto(docRef.current,tempDoc)
                    setText(getContent(docRef.current))
                }
            }
        }
        connect()

        return()=>wsRef.current?.close()

    },[])
 }

 function handleChange(e:React.ChangeEvent<HTMLTextAreaElement>){
    const newText=e.target.value;
    const currentPosition=e.target.selectionStart;

    if(newText.length>Text.length){

    }


 }

