import dotenv from "dotenv";
dotenv.config(); 

import express from "express"
import {createServer } from "http"
import {WebSocketServer,WebSocket} from "ws"
import {createDoc,mergeInto,Doc, Item, getContent} from "@sync/engine"
import {OperationModel} from "./models/operation"
import mongoose from "mongoose"
import {CustomWebsocket} from "./types/index"





const app=express();
const server=createServer(app);
const wss=new WebSocketServer({server})


const activeDocuments=new Map<string,Doc>();
async function startServer() {
    try{
        const connectingString=process.env.MONGODB as unknown as string
        await mongoose.connect(connectingString)
        console.log("connected to mongoDb")
        

        wss.on("connection",async(ws:CustomWebsocket,req)=>{

            const url=new URL(req.url || "/", "http://localhost")
            const documentId=url.searchParams.get("docId")
            if(!documentId) return ws.close(1008,"DocumentId is requried")
            console.log(`Processing the ${documentId}`)

            ws.docId=documentId;
            try{
                let masterDoc:Doc=activeDocuments.get(documentId) as unknown as Doc

                if(!masterDoc){


                const historicalData=await OperationModel.find({documentId}).sort({timeStamp:1})

                masterDoc=createDoc()
                
              


                    for(const Op of historicalData){
                    const tempDoc:Doc=createDoc();
                    const itemToinsert=Op.item as unknown as Item
                    tempDoc.content.push(itemToinsert) 
                    mergeInto(masterDoc,tempDoc)
                }

                activeDocuments.set(documentId,masterDoc)
            }


            ws.send(JSON.stringify({type:"sync",doc:masterDoc}))

            ws.on("message",async(data)=>{
                const payload=JSON.parse(data.toString())
                if(payload.type === "INSERT"|| payload.type === "DELETE"){
                    const incomingItem:Item=payload.item

                    const tempDoc:Doc=createDoc();
                    tempDoc.content.push(incomingItem)
                    mergeInto(masterDoc,tempDoc)

                    try{
                    await OperationModel.create({
                        documentId:documentId,
                        item:incomingItem,
                        type:payload.type
                    })

                }catch(e){
                    console.log("Error in Here",e)
                }
                }
                else if (payload.type === "SYNC_BATCH"){
                    const incomingItems:Item[]= payload.items;

                    //process All items in ROM
                    const tempDoc:Doc = createDoc();
                    for(const item of incomingItems){
                        tempDoc.content.push(item);
                    }
                    mergeInto(masterDoc,tempDoc);

                    try{
                        const dpOperations=incomingItems.map(item =>({
                            documentId:documentId,
                            item:item,
                            type:item.deleted ? "DELETE":"INSERT"
                        }))
                        await OperationModel.insertMany(dpOperations)

                    }catch(e){
                        console.log("Error saving batch to DB",e);
                    }
                }
                
                wss.clients.forEach((client:CustomWebsocket)=>{
                    if(client !== ws && client.readyState === 1 && client.docId===documentId){
                        client.send(JSON.stringify(payload))
                    }
                })
            });
            }catch(e){
                console.log("Error in the",e)
            }
        })
    }catch(e){
        console.log("Error in the",e)
    }
    
}


startServer();
server.listen(4000,()=>console.log("Server running on port 4000"));