class ApiError extends Error {
    constructor(
        statusCode,
        message = "Something went wrong",
        errors = [],
        statck = ""
    ){
        super(message) //super -> call when we need to overwrite the message
        this.statusCode = this.statusCode
        this.data = null
        this.message = message
        this.success = false;
        this.errors = errors

        if(statck){
            this.stack = statck
        }else{
            Error.captureStackTrace(this,this.constructor)
        }
    }
}

export {ApiError}