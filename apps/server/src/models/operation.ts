import mongoose from "mongoose"

const OperationSchema=new mongoose.Schema({
    documentId:{
        type:String,
        required:true,
        default:"global-doc"
    },
    type:{
        type:String,
        enum:["INSERT","DELETE"],
        required:true
    },
    item:{
        content:{type:String,default:""},
        Id:{type:[mongoose.Schema.Types.Mixed],required:true},
        deleted:{type:Boolean,default:false},
        originLeft:{type:[mongoose.Schema.Types.Mixed],default:null},
        originRight:{type:[mongoose.Schema.Types.Mixed],default:null}
    },

    timestamp:{
        type:Date,
        default:Date.now
    }
})

export const OperationModel=mongoose.model("Operation",OperationSchema);