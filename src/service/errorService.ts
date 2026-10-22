class HttpError extends Error {
    code: number;
    status: number;
    statusCode: number;
    success: boolean;

    constructor(message: string, errorCode: number, success: boolean) {
        super(message);
        this.name = "HttpError";
        this.code = errorCode;
        this.status = errorCode;
        this.statusCode = errorCode;
        this.success = success;
    }

}

export function rethrowServiceError(error: unknown, context: string): never {
    if (error instanceof HttpError) {
        throw error;
    }
    if (
        error instanceof Error &&
        "statusCode" in error &&
        typeof error.statusCode === "number"
    ) {
        throw new HttpError(error.message, error.statusCode, false);
    }
    console.error(context, error instanceof Error ? error.message : error);
    throw new HttpError("Erreur serveur. Veuillez réessayer plus tard.", 500, false);
}

export default HttpError;