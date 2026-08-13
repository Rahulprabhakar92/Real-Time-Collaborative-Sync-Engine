import express from "express"
import {createServer } from "http"
import {WebSocketServer,WebSocket} from "ws"
import {createDoc,mergeInto,Doc, Item} from "@sync/engine"



const app=express();
const server=createServer(app);
const wss=new WebSocketServer({server})



wss.on("connection",(ws)=>{
    console.log("Client Connected")
    const masterDoc:Doc=createDoc()

    ws.send(JSON.stringify({type:"sync",doc:masterDoc}));

    ws.on('message',(data)=>{
        const payload=JSON.parse(data.toString())

        if(payload.type === 'insert' || payload.type === "delete"){
            const incomingItem:Item=payload.item

            const tempDoc:Doc=createDoc();
            tempDoc.content.push(incomingItem);
            mergeInto(masterDoc,tempDoc);
        }

        wss.clients.forEach((client)=>{
            if(client !== ws && client.readyState === WebSocket.OPEN){
            client.send(JSON.stringify(payload))
            }
        })
    })
})


server.listen(4000,()=>console.log("Server running on port 4000"));