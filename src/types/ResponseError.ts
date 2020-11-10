export default class ResponseError extends Error {
    public readonly response: Response;
    public readonly type = 'GradResponseError';

    constructor(response: Response) {
        super(response.statusText);

        this.response = response;
    }
}
