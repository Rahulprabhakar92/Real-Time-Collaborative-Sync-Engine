import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { createDoc, mergeInto, Doc, Item, localInsert } from "@sync/engine";
import { OperationModel } from "./models/operation";
import mongoose from "mongoose";
import { CustomWebsocket } from "./types/index";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const activeDocuments = new Map<string, { doc: Doc; meta: { createdAt: number; updatedAt: number; version: number } }>();
const roomPresence = new Map<string, Map<string, any>>();

const getRoomState = (documentId: string) => {
  const existing = activeDocuments.get(documentId);
  if (existing) return existing;

  const nextState = {
    doc: createDoc(),
    meta: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 0,
    },
  };

  activeDocuments.set(documentId, nextState);
  return nextState;
};

const removePresenceForClient = (documentId: string, userId?: string) => {
  if (!userId) return;

  const roomUsers = roomPresence.get(documentId);
  if (!roomUsers) return;

  roomUsers.delete(userId);
  if (roomUsers.size === 0) {
    roomPresence.delete(documentId);
  }
};

async function startServer() {
  try {
    const connectingString = process.env.MONGODB as unknown as string;
    await mongoose.connect(connectingString);
    console.log("connected to mongoDb");

    wss.on("connection", async (ws: CustomWebsocket, req) => {
      const url = new URL(req.url || "/", "http://localhost");
      const documentId = url.searchParams.get("docId");
      const requestedUserId = url.searchParams.get("userId");

      if (!documentId) return ws.close(1008, "DocumentId is requried");

      console.log(`Processing the ${documentId}`);

      ws.docId = documentId;
      ws.userId = requestedUserId || `user-${Math.random().toString(36).slice(2, 8)}`;

      ws.on("close", () => {
        removePresenceForClient(documentId, ws.userId);
      });

      try {
        const roomState = getRoomState(documentId);

        if (roomState.doc.content.length === 0) {
          const historicalData = await OperationModel.find({ documentId }).sort({ timestamp: 1 });
          const tempDoc: Doc = createDoc();

          for (const operation of historicalData) {
            const itemToInsert = operation.item as unknown as Item;
            tempDoc.content.push(itemToInsert);
          }

          mergeInto(roomState.doc, tempDoc);
        }

        ws.send(JSON.stringify({ type: "sync", doc: roomState.doc, meta: roomState.meta }));

        ws.on("message", async (data) => {
          const payload = JSON.parse(data.toString());

          if (payload.type === "presence") {
            const user = payload.user ?? {};
            const stableUserId = user.id || ws.userId;
            const presenceUser = {
              ...user,
              id: stableUserId,
              lastSeen: Date.now(),
            };

            ws.userId = stableUserId;
            const roomUsers = roomPresence.get(documentId) ?? new Map();
            roomUsers.set(stableUserId, presenceUser);
            roomPresence.set(documentId, roomUsers);

            wss.clients.forEach((client: CustomWebsocket) => {
              if (client !== ws && client.readyState === 1 && client.docId === documentId) {
                client.send(JSON.stringify({ type: "presence", user: presenceUser }));
              }
            });

            return;
          }

          if (payload.type === "RESTORE") {
            const restoredText = payload.text ?? "";
            const rebuilt = createDoc();
            let cursor = 0;

            for (const character of restoredText) {
              localInsert(rebuilt, cursor, `restore-${documentId}`, character);
              cursor += 1;
            }

            roomState.doc = rebuilt;
            roomState.meta.updatedAt = Date.now();
            roomState.meta.version += 1;

            wss.clients.forEach((client: CustomWebsocket) => {
              if (client.readyState === 1 && client.docId === documentId) {
                client.send(JSON.stringify({ type: "RESTORE", text: restoredText, meta: roomState.meta }));
              }
            });
            return;
          }

          if (payload.type === "INSERT" || payload.type === "DELETE") {
            const incomingItem: Item = payload.item;
            const tempDoc: Doc = createDoc();
            tempDoc.content.push(incomingItem);
            mergeInto(roomState.doc, tempDoc);
            roomState.meta.updatedAt = Date.now();
            roomState.meta.version += 1;

            try {
              await OperationModel.create({
                documentId,
                item: incomingItem,
                type: payload.type,
              });
            } catch (error) {
              console.log("Error saving insert to DB", error);
            }
          } else if (payload.type === "SYNC_BATCH") {
            const incomingItems: Item[] = payload.items;
            const tempDoc: Doc = createDoc();

            for (const item of incomingItems) {
              tempDoc.content.push(item);
            }

            mergeInto(roomState.doc, tempDoc);
            roomState.meta.updatedAt = Date.now();
            roomState.meta.version += incomingItems.length;

            try {
              const dpOperations = incomingItems.map((item) => ({
                documentId,
                item,
                type: item.deleted ? "DELETE" : "INSERT",
              }));
              await OperationModel.insertMany(dpOperations);
            } catch (error) {
              console.log("Error saving batch to DB", error);
            }
          }

          wss.clients.forEach((client: CustomWebsocket) => {
            if (client.readyState === 1 && client.docId === documentId) {
              client.send(JSON.stringify({ ...payload, meta: roomState.meta }));
            }
          });
        });
      } catch (error) {
        console.log("Error in the", error);
      }
    });
  } catch (error) {
    console.log("Error in the", error);
  }
}

startServer();
server.listen(4000, () => console.log("Server running on port 4000"));