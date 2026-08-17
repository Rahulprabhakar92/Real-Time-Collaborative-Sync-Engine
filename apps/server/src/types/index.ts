import {WebSocket} from 'ws'

export interface CustomWebsocket extends WebSocket{
    docId?:string
}
