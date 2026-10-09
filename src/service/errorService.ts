class HttpError extends Error {
    code: number;
    success: boolean;

    constructor(message: string, errorCode: number, succes: boolean) {
        super(message); // 
        this.code = errorCode; // 
        this.success = succes;
    }

}

export default HttpError;