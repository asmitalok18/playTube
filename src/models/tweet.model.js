import mongoose from "mongoose";


const tweetSchema  = new Schema({
    content:{
        type:String,
        required:true,
    },
    owner:{
        type: Schema.Types.objectId,
        ref:"User"
    }
},{timestamps:true})

export const Tweet = mongoose.model("Tweet",tweetSchema)