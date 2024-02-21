import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js"
import {User} from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken"


const generateAccessAndRefreshTokens = async(userId)=>{
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken() 

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })

        return {accessToken,refreshToken}


    } catch (error) {
        throw new ApiError(500,"Something went wrong while generating refresh and access token")
    }
}


const registerUser = asyncHandler(async (req, res) =>{
    //get user details from frontend
    const {fullName,email,username,password} = req.body
    // console.log("email: ",email);
    //validation - not empty
    if(
        [fullName,email,username,password].some((field) =>field?.trim() === "")
    ){
        throw new ApiError(400,"All fields are required")
    }
    //check if user already exists: username,email
    const existedUser = await User.findOne({
        $or:[{username},{email}]
    })

    if(existedUser){
        throw new ApiError(409,"User with email or username already exist")
    }
    // console.log(req.files);
    //check for images, check for avatar
   const avatarLocalPath =  req.files?.avatar[0]?.path;
//    const coverImageLocalPath = req.files?.coverImage[0]?.path;

    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverImageLocalPath = req.files.coverImage[0].path
    }

   if(!avatarLocalPath){
    throw new ApiError(400,"Avatar file is required")
   }
    //upload them to cloudinary, avatar
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)
    if(!avatar){
        throw new ApiError(400,"Avatar file is required")
    }
    // create user object - create entry in db
    // remove pssword and refresh token field froom response
    // check for user creation
    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage:coverImage?.url || "",
        email,
        password,
        username:username.toLowerCase()
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )
    if(!createdUser){
        throw new ApiError(500,"Something went wrong while registring the user")
    }
    
    // return res
    return res.status(201).json(
        new ApiResponse(200,createdUser,"User registered successfully")
    )

    
})


const loginUser = asyncHandler(async(req,res) =>{
    //req body -> data
    //username or email
    //find the user
    //password check
    //access and refresh token
    //send cookies

    const {email,username,password} = req.body
    console.log(email)
    if(!username || !email){
        if(!username && !email){
            throw new ApiError(400,"username or email is required")
        }
    }

    const user = await User.findOne({
        $or:[{username},{email}]
    })

    if(!user){
        throw new ApiError(404,"User does not exist")
    }

    const isPasswordValid = await user.isPasswordCorrect(password)
    if(!isPasswordValid){
        throw new ApiError(401,"Invalid user credentials")
    }
    const {accessToken,refreshToken}=await generateAccessAndRefreshTokens(user._id)

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly: true,
        secure:true
    }
    return res
    .status(200)
    .cookie("accessToken",accessToken,options)
    .cookie("refreshToken",refreshToken,options)
    .json(
        new ApiResponse(
            200,
            {
                user:loggedInUser,accessToken,refreshToken
            },
            "User logged In Successfully"
        )
    )

})



const logoutUser = asyncHandler(async(req,res)=>{
     await User.findByIdAndUpdate(
        req.user._id,
        {
            $set:{
                refreshToken: undefined
            }
        },
        {
            new: true
        }
     )
     const options = {
        httpOnly: true,
        secure: true
     }
     return res
     .status(200)
     .clearCookie("accessToken",options)
     .clearCookie("refreshToken",options)
     .json(new ApiResponse(200,{},"User logout successfully"))
})

const refreshAccessToken = asyncHandler(async(req,res) =>{
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if(!incomingRefreshToken) {
        throw new ApiError(401,"unauthorized request") 
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
        const user = await User.findById(decodedToken?._id)
        if(!user){
            throw new ApiError(401,"Invalid refresh token")
        }
    
        if(incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401,"Refresh token is expired or used")
        }
        const options = {
            httpOnly: true,
            secure: true,
        }
    
        const {accessToken,newRefreshToken}  = await generateAccessAndRefreshTokens(user._id)
    
        return res
        .status(200)
        .cookie("access_token",accessToken,options)
        .cookie("refresh_token",newRefreshToken,options)
        .json(
            new ApiResponse(
                200,
                {accessToken,refreshToken:newRefreshToken},
                "Access token refreshed "
            )
        )
    } catch (error) {
        throw new ApiError(401,error?.message || "Invalid refresh token")
    }

})

const changeCurrentPassword = asyncHandler(async(req,res) =>{
    const {oldPassword,newPassword} =req.body
    const user =  await User.findById(req.user?._id)
    const isPasswordCorrect =  user.isPasswordCorrect(oldPassword)
    if(!isPasswordCorrect) {
        throw new ApiError(400,"Invalid old password")
    }

    user.password = newPassword
    await user.save({validateBeforeSave:false})

    return res
    .status(200)
    .json(new ApiResponse(200,"Password Change Successfully"))
})

const getCurrentUser = asyncHandler(async(req,res)=>{
    return res
    .status(200)
    .json(new ApiResponse(200,req.user,"current user fetched successfully"))
})

const updateAccountDetails = asyncHandler(async(req,res)=>{
    const {fullName,email} = req.body
    if(!fullName || !email){
        throw new ApiError(400,"All fields are required")
    }
    const user = User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                fullName:fullName,
                email:email
            }
        },
        {new: true}
        ).select("-password")
        return res
        .status(200)
        .json(new ApiResponse(200,user,"Account details updated successfully"))
})

const updateUserAvatar = async (req, res) =>{
   const avatarLocalPath = req.file?.path
   if(!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is missing")
   }
   const avatar = await uploadOnCloudinary(avatarLocalPath)
   if(!avatar.url){
    throw new ApiError(400, "Error while uploading on avatar")
   }
   const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
        $set:{
            avatr:avatar.url
        }
    },
    {new: true}
   ).select("-password")

   return res
    .status(200)
    .json(
        new ApiResponse(200,user,"avatar updated successfully")
    )
}

const updateCoverImage = async (req, res) =>{
    const coverImageLocalPath = req.file?.path
    if(!coverImageLocalPath) {
     throw new ApiError(400, "Cover Image file is missing")
    }
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)
    if(!coverImage.url){
     throw new ApiError(400, "Error while uploading on Cover Image")
    }
    const user = await User.findByIdAndUpdate(
     req.user?._id,
     {
         $set:{
             coverImage:coverImage.url
         }
     },
     {new: true}
    ).select("-password")
    return res
    .status(200)
    .json(
        new ApiResponse(200,user,"Cover image updated successfully")
    )
 }

const getUserChannelProfile = asyncHandler(async(req,res) =>{
    const {username} = req.params

    if(!username?.trim()){
        throw new ApiError(400,"username is missing")
    }

    const channel = await User.aggregate([
        {
            $match:{
                username:username?.toLowerCase()
            }
        },
        {
            $lookup:{
                from:"subscription",
                localField:"_id",
                foreignField:"channel",
                as:"subscribers"
            }
        },
        {
            $lookup:{
                from:"subscription",
                localField:"_id",
                foreignField:"subscriber",
                as:"subscribedTo"
            }
        },
        {
            $addFields:{
                subscribersCount:{
                    $size:"$subscribers"
                },
                channelSubscribedToCount:{
                    $size:"$subscribedTo"
                },
                isSubscribed:{
                    $cond:{
                        if:{$in:[req.user?._id,"$subscribers.subscriber"]},
                        then:true,
                        else:false
                    }
                }
            }
        },
        {
            $project:{
                fullName: 1,
                username: 1,
                subscribersCount:1,
                channelSubscribedToCount:1,
                isSubscribed:1,
                avatar:1,
                coverImage:1,
                email:1
            }
        }
    ])
    if(!channel?.length){
        throw new ApiError(404,"channel does not exists")
    }

    return res
    .status(200)
    .json(
        new ApiResponse(200,channel[0],"User channel fetched successfully")
    )
})

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateCoverImage,
    getUserChannelProfile
}